document.addEventListener('DOMContentLoaded', (e) => {
    e.preventDefault()

    const promptInput = document.getElementById('promptInput')
    const sendBtn = document.getElementById('sendBtn')
    const clearBtn = document.getElementById('clearBtn')
    const btnText = sendBtn.querySelector('span')
    const btnLoader = document.getElementById('btnLoader')
    const responseOutput = document.getElementById('responseOutput')
    const footerYear = document.querySelector('.footer-year')
    let isHostTurn = true // l'Hôte commence
    const MAX_TURNS_FOR_API = 10 // nb de répliques max envoyées au modèle (hors message système)

    // 🎚️ NEW: champs de configuration dans la page
    const situationInput = document.getElementById('situationInput')
    const hostDescInput = document.getElementById('hostDescInput')
    const guestDescInput = document.getElementById('guestDescInput')

    // 🎚️ NEW: valeurs par défaut si l’utilisateur ne remplit rien
    const DEFAULT_SITUATION = 'podcast pédagogique'
    const DEFAULT_HOST_DESC =
        'un enseignant homme enthousiaste et bienveillant, ton calme, courtois, registre soutenu, qui pose des questions et relance le débat'
    const DEFAULT_GUEST_DESC =
        'une enseignante femme enthousiaste et bienveillante, experte ou passionnée, qui répond de manière précise et nuancée, registre soutenu'

    if (footerYear) {
        footerYear.textContent = new Date().getFullYear()
    }

    // --- CONFIGURATION ---

    // ⚠️ ATTENTION : En production, ne jamais laisser une clé API côté client.
    // On passe désormais par notre backend Vercel
    const API_URL = '/api/chat'

    // TTS : endpoints Piper HTTP
    // Tu peux inverser les URLs si tu veux Hôte=femme, Invité=homme.
    const TTS_HOST_URL = 'https://ttsh.lagrandeclasse.fr/' // Hôte -> femme
    const TTS_GUEST_URL = 'https://ttsf.lagrandeclasse.fr/' // Invité -> homme

    let isRunning = false // Pour arrêter le podcast
    let conversationHistory = [] // Historique pour le LLM
    let currentAudio = null // Audio en cours de lecture
    let currentAudioUrl = null // URL à libérer pour l'audio courant
    let currentAudioResolver = null // Permet de résoudre la promesse de lecture si on stoppe manuellement

    // Stoppe proprement le son en cours (si présent) et résout la promesse rattachée
    const stopAudioPlayback = () => {
        if (currentAudio) {
            currentAudio.onended = null
            currentAudio.onerror = null
            currentAudio.onpause = null
            currentAudio.pause()
            currentAudio.currentTime = 0
        }

        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl)
        }

        currentAudio = null
        currentAudioUrl = null

        if (currentAudioResolver) {
            const resolver = currentAudioResolver
            currentAudioResolver = null
            resolver()
        }
    }

    // --- FONCTIONS IA ---

    // Ne renvoie que le message système + les X derniers messages
    const getMessagesForApi = () => {
        if (conversationHistory.length === 0) return []

        const systemMessage = conversationHistory[0] // { role: "system", ... }
        const otherMessages = conversationHistory.slice(1) // tout le reste (assistant)

        if (otherMessages.length <= MAX_TURNS_FOR_API) {
            return conversationHistory
        }

        const trimmed = otherMessages.slice(-MAX_TURNS_FOR_API)
        return [systemMessage, ...trimmed]
    }

    // Appel DeepSeek (compatible OpenAI)
    // Appel via backend /api/chat
    const callDeepSeek = async (messages) => {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages }), // on envoie juste messages
            })

            if (!response.ok) {
                throw new Error(`Erreur API: ${response.status}`)
            }

            const data = await response.json()
            return data.choices[0].message.content
        } catch (error) {
            console.error("Erreur lors de l'appel DeepSeek:", error)
            return null
        }
    }

    // --- FONCTIONS TTS ---

    // Découpe un texte en petits blocs pour le TTS (phrases + longueur max)
    const splitIntoChunks = (text, maxLen = 220) => {
        // Découpage grossier en phrases sur . ! ?
        const sentences = text.match(/[^.!?]+[.!?]?/g) || [text]

        const chunks = []
        let current = ''

        for (const raw of sentences) {
            const s = raw.trim()
            if (!s) continue

            if ((current + ' ' + s).length > maxLen) {
                if (current) chunks.push(current.trim())
                // Si une seule phrase dépasse maxLen, on la pousse telle quelle
                if (s.length > maxLen) {
                    chunks.push(s)
                    current = ''
                } else {
                    current = s
                }
            } else {
                current = current ? current + ' ' + s : s
            }
        }

        if (current) chunks.push(current.trim())
        return chunks
    }

    // Récupère l’URL de base TTS en fonction de l’interlocuteur
    const getTTSBaseUrlForSpeaker = (speaker) => {
        if (speaker === 'Hôte') return TTS_HOST_URL
        if (speaker === 'Invité') return TTS_GUEST_URL
        // fallback : Hôte
        return TTS_HOST_URL
    }

    // Joue un seul "chunk" TTS pour un speaker
    const playTTSChunkForSpeaker = async (speaker, text) => {
        try {
            const baseUrl = getTTSBaseUrlForSpeaker(speaker)
            const params = new URLSearchParams({
                text: text,
                format: 'wav',
                // si besoin : speaker_id, etc.
            })

            const ttsUrl = `${baseUrl}?${params.toString()}`

            const response = await fetch(ttsUrl)
            if (!response.ok) {
                throw new Error(`Erreur TTS (${speaker}): ${response.status}`)
            }

            const audioBlob = await response.blob()
            const audioUrl = URL.createObjectURL(audioBlob)
            stopAudioPlayback() // Évite tout chevauchement de son précédent
            const audio = new Audio(audioUrl)
            currentAudio = audio
            currentAudioUrl = audioUrl

            // On retourne une promesse qui se résout à la fin de la lecture ou en cas d'arrêt manuel
            return new Promise((resolve) => {
                let settled = false
                currentAudioResolver = () => {
                    if (settled) return
                    settled = true
                    resolve()
                }

                const finalizePlayback = () => {
                    if (currentAudio === audio) {
                        stopAudioPlayback()
                    } else if (currentAudioResolver) {
                        const resolver = currentAudioResolver
                        currentAudioResolver = null
                        resolver()
                    }
                }

                audio.onended = finalizePlayback
                audio.onerror = (err) => {
                    console.error('Erreur lecture audio:', err)
                    finalizePlayback()
                }
                audio.onpause = () => {
                    if (!audio.ended) {
                        finalizePlayback()
                    }
                }

                // Peut être bloqué si autoplay n'est pas autorisé, mais comme ça démarre après un clic, ça passe en général.
                audio.play().catch((err) => {
                    console.warn("Impossible de lancer l'audio (autoplay ?) :", err)
                    finalizePlayback()
                })
            })
        } catch (e) {
            console.error('Erreur TTS:', e)
            // On ne bloque pas la boucle si le TTS plante
            return
        }
    }

    // Appelle le TTS en mode chunké : plusieurs petits appels séquentiels
    const speakTextForSpeaker = async (speaker, fullText) => {
        const chunks = splitIntoChunks(fullText, 220)
        console.log(`TTS ${speaker} chunks:`, chunks)

        for (const chunk of chunks) {
            if (!isRunning) {
                // Si le podcast est arrêté entre deux chunks, on sort proprement
                break
            }
            await playTTSChunkForSpeaker(speaker, chunk)
        }
    }

    // --- UI ---

    const appendMessageToUI = (speaker, text) => {
        const msg_ia = document.createElement('div')
        msg_ia.style.marginBottom = '15px'
        msg_ia.style.padding = '10px'
        msg_ia.style.borderRadius = '8px'
        msg_ia.style.maxWidth = '85%'

        if (speaker === 'Hôte') {
            msg_ia.style.backgroundColor = '#e0f2fe' // Bleu clair
            msg_ia.style.borderLeft = '4px solid #0284c7'
            msg_ia.style.marginLeft = '0'
            msg_ia.innerHTML = `<strong>🎙️ Hôte :</strong> ${text}`
        } else if (speaker === 'Invité') {
            msg_ia.style.backgroundColor = '#f0fdf4' // Vert clair
            msg_ia.style.borderLeft = '4px solid #16a34a'
            msg_ia.style.marginLeft = 'auto'
            msg_ia.innerHTML = `<strong>🗣️ Invité :</strong> ${text}`
        } else {
            // Pour les messages système / erreurs
            msg_ia.style.backgroundColor = '#fee2e2'
            msg_ia.style.borderLeft = '4px solid #b91c1c'
            msg_ia.style.marginLeft = '0'
            msg_ia.innerHTML = `<strong>⚠️ Système :</strong> ${text}`
        }

        responseOutput.appendChild(msg_ia)
        responseOutput.scrollTop = responseOutput.scrollHeight
    }

    // --- BOUCLE DE PODCAST ---

    const conversationLoop = async () => {
        if (!isRunning) return

        // turnCount = nb de messages (y compris le system) déjà envoyés au modèle
        const turnCount = conversationHistory.length
        // On alterne Hôte / Invité :
        // Après le system (index 0), premier tour => turnCount = 1 -> Hôte
        // puis Invité, etc.
        const currentSpeaker = isHostTurn ? 'Hôte' : 'Invité'

        try {
            const messagesForApi = getMessagesForApi()
            const reply = await callDeepSeek(messagesForApi)

            if (!reply) {
                appendMessageToUI('Système', "Erreur de connexion à l'IA. Arrêt du podcast.")
                stopPodcast()
                return
            }

            // 1. Affichage texte
            appendMessageToUI(currentSpeaker, reply)

            // 2. Lecture audio via TTS (chunkée)
            await speakTextForSpeaker(currentSpeaker, reply)

            // 3. Mise à jour de l’historique pour DeepSeek
            conversationHistory.push({
                role: 'assistant',
                content: reply,
            })

            // 🔁 Toggle du speaker
            isHostTurn = !isHostTurn

            // 4. On relance la boucle si toujours en cours
            if (isRunning) {
                conversationLoop()
            }
        } catch (e) {
            console.error(e)
            appendMessageToUI('Système', 'Erreur interne. Arrêt du podcast.')
            stopPodcast()
        }
    }

    const stopPodcast = () => {
        isRunning = false
        sendBtn.disabled = false
        btnText.innerText = '⚙️Lancer le Podcast'
        btnText.style.display = 'inline'
        btnLoader.style.display = 'none'
        stopAudioPlayback()
    }

    // --- GESTIONNAIRES D'ÉVÉNEMENTS ---

    sendBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        const text = promptInput.value.trim()

        // Si déjà en cours, clic = on arrête
        if (isRunning) {
            stopPodcast()
            isHostTurn = true // 🔁 Reset pour la prochaine fois
            return
        }

        if (!text) {
            promptInput.focus()
            promptInput.style.borderColor = '#ef4444'
            setTimeout(() => (promptInput.style.borderColor = ''), 2000)
            return
        }

        // 🎚️ NEW: on lit les 3 champs utilisateur avec fallback sur les valeurs par défaut
        const situation = (situationInput?.value || DEFAULT_SITUATION).trim() || DEFAULT_SITUATION
        const hostDesc = (hostDescInput?.value || DEFAULT_HOST_DESC).trim() || DEFAULT_HOST_DESC
        const guestDesc = (guestDescInput?.value || DEFAULT_GUEST_DESC).trim() || DEFAULT_GUEST_DESC

        // 🚨 Ici on démarre : on reset le speaker AVANT de lancer
        isHostTurn = true

        isRunning = true
        btnText.innerText = '⚙️Arrêter le Podcast'
        btnLoader.style.display = 'block'

        responseOutput.innerHTML = ''
        responseOutput.style.display = 'block'

        // 🎚️ NEW: prompt dynamique avec situation + descriptions
        const systemPrompt = `
            Tu simules ${situation} entre deux personnes sur le thème : "${text}".

            Rôles :
            - Interlocuteur A = Hôte : ${hostDesc}.
            - Interlocuteur B = Invité : ${guestDesc}.

            STYLE OBLIGATOIRE :
            - Réponds TOUJOURS en français.
            - Registre soutenu : pas d'argot, pas de verlan, vocabulaire clair et précis.
            - Dialogue naturel : chaque réplique doit rebondir sur la précédente.
            - Réponse très courte : 20 à 40 mots maximum, idéalement ~30 mots.
            - Maximum 120 caractères environ.
            - Ne PAS commencer par "Hôte:" ou "Invité:", uniquement le texte parlé.
            - Ne jamais conclure la discussion, toujours laisser une ouverture.

            Exemples de longueur attendue :
            - "Pourriez-vous préciser en quoi cette approche d'IA transforme concrètement nos pratiques quotidiennes ?"
            - "Elle structure l'apprentissage et évite de se disperser dans des détails techniques secondaires."

            Commence par une courte phrase de l'Hôte qui introduit le sujet.
        `

        conversationHistory = [{ role: 'system', content: systemPrompt }]

        console.log(`Démarrage du podcast sur: ${text}`)
        conversationLoop()
    })

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (isRunning) {
                stopPodcast()
            }
            promptInput.value = ''
            responseOutput.innerHTML = ''
            responseOutput.style.display = 'none'
            promptInput.focus()
        })
    }

    // Entrée pour lancer (Shift+Entrée autorise un saut de ligne)
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendBtn.click()
        }
    })
})
