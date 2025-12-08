document.addEventListener('DOMContentLoaded', (e) => {
    e.preventDefault() /* test */

    const promptInput = document.getElementById('promptInput')
    const sendBtn = document.getElementById('sendBtn')
    const clearBtn = document.getElementById('clearBtn')
    const btnText = sendBtn.querySelector('span')
    const btnLoader = document.getElementById('btnLoader')
    const responseOutput = document.getElementById('responseOutput')
    const footerYear = document.querySelector('.footer-year')
    let isHostTurn = true // l'Hôte commence
    const MAX_TURNS_FOR_API = 10 // nb de répliques max envoyées au modèle (hors message système)

    // 🎚️ champs de configuration dans la page
    const situationInput = document.getElementById('situationInput')
    const hostDescInput = document.getElementById('hostDescInput')
    const guestDescInput = document.getElementById('guestDescInput')

    // 🎚️ valeurs par défaut si l’utilisateur ne remplit rien
    const DEFAULT_SITUATION = 'podcast pédagogique'
    const DEFAULT_HOST_DESC =
        'un enseignant homme enthousiaste et bienveillant, ton calme, courtois, registre soutenu, qui pose des questions et relance le débat'
    const DEFAULT_GUEST_DESC =
        'une enseignante femme enthousiaste et bienveillante, experte ou passionnée, qui répond de manière précise et nuancée, registre soutenu'

    if (footerYear) {
        footerYear.textContent = new Date().getFullYear()
    }

    // --- CONFIGURATION ---
    const API_URL = '/api/chat'

    const TTS_HOST_URL = 'https://ttsh.lagrandeclasse.fr/' // Hôte -> femme
    const TTS_GUEST_URL = 'https://ttsf.lagrandeclasse.fr/' // Invité -> homme

    let isRunning = false
    let conversationHistory = [] // Historique des messages envoyés au LLM (system + assistant)
    let currentAudio = null
    let currentAudioUrl = null
    let currentAudioResolver = null

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

    const getMessagesForApi = () => {
        if (conversationHistory.length === 0) return []

        const systemMessage = conversationHistory[0]
        const otherMessages = conversationHistory.slice(1)

        if (otherMessages.length <= MAX_TURNS_FOR_API) {
            return conversationHistory
        }

        const trimmed = otherMessages.slice(-MAX_TURNS_FOR_API)
        return [systemMessage, ...trimmed]
    }

    const callDeepSeek = async (messages) => {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages }),
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

    const splitIntoChunks = (text, maxLen = 220) => {
        const sentences = text.match(/[^.!?]+[.!?]?/g) || [text]

        const chunks = []
        let current = ''

        for (const raw of sentences) {
            const s = raw.trim()
            if (!s) continue

            if ((current + ' ' + s).length > maxLen) {
                if (current) chunks.push(current.trim())
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

    const getTTSBaseUrlForSpeaker = (speaker) => {
        if (speaker === 'Hôte') return TTS_HOST_URL
        if (speaker === 'Invité') return TTS_GUEST_URL
        return TTS_HOST_URL
    }

    const playTTSChunkForSpeaker = async (speaker, text) => {
        try {
            const baseUrl = getTTSBaseUrlForSpeaker(speaker)
            const params = new URLSearchParams({
                text: text,
                format: 'wav',
            })

            const ttsUrl = `${baseUrl}?${params.toString()}`

            const response = await fetch(ttsUrl)
            if (!response.ok) {
                throw new Error(`Erreur TTS (${speaker}): ${response.status}`)
            }

            const audioBlob = await response.blob()
            const audioUrl = URL.createObjectURL(audioBlob)
            stopAudioPlayback()
            const audio = new Audio(audioUrl)
            currentAudio = audio
            currentAudioUrl = audioUrl

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

                audio.play().catch((err) => {
                    console.warn("Impossible de lancer l'audio (autoplay ?) :", err)
                    finalizePlayback()
                })
            })
        } catch (e) {
            console.error('Erreur TTS:', e)
            return
        }
    }

    const speakTextForSpeaker = async (speaker, fullText) => {
        const chunks = splitIntoChunks(fullText, 220)
        console.log(`TTS ${speaker} chunks:`, chunks)

        for (const chunk of chunks) {
            if (!isRunning) break
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
            msg_ia.style.backgroundColor = '#e0f2fe'
            msg_ia.style.borderLeft = '4px solid #0284c7'
            msg_ia.style.marginLeft = '0'
            msg_ia.innerHTML = `<strong>🎙️ Hôte :</strong> ${text}`
        } else if (speaker === 'Invité') {
            msg_ia.style.backgroundColor = '#f0fdf4'
            msg_ia.style.borderLeft = '4px solid #16a34a'
            msg_ia.style.marginLeft = 'auto'
            msg_ia.innerHTML = `<strong>🗣️ Invité :</strong> ${text}`
        } else {
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

        const currentSpeaker = isHostTurn ? 'Hôte' : 'Invité'

        try {
            const coreMessages = getMessagesForApi()
            // 💡 On ajoute un message "user" qui dit clairement qui doit parler et comment
            const messagesForApi = [
                ...coreMessages,
                {
                    role: 'user',
                    content: `Tu joues un dialogue entre deux personnes, mais pour ce tour-ci tu dois écrire UNIQUEMENT la prochaine réplique de ${currentSpeaker}.

- Parle en français, registre soutenu.
- Une seule réplique courte : 20 à 40 mots maximum.
- Ne joue que le rôle de ${currentSpeaker}, ne réponds pas pour l'autre.
- Ne décris pas la scène, ne mets pas de didascalies.
- Ne répète pas mot pour mot les répliques précédentes.
- Ne traduis pas la réplique précédente, produis une nouvelle phrase qui fait avancer la conversation.`,
                },
            ]

            const reply = await callDeepSeek(messagesForApi)

            if (!reply) {
                appendMessageToUI('Système', "Erreur de connexion à l'IA. Arrêt du podcast.")
                stopPodcast()
                return
            }

            appendMessageToUI(currentSpeaker, reply)

            await speakTextForSpeaker(currentSpeaker, reply)

            // On enregistre la réplique comme réponse de l’assistant
            conversationHistory.push({
                role: 'assistant',
                content: reply,
            })

            isHostTurn = !isHostTurn

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

        if (isRunning) {
            stopPodcast()
            isHostTurn = true
            return
        }

        if (!text) {
            promptInput.focus()
            promptInput.style.borderColor = '#ef4444'
            setTimeout(() => (promptInput.style.borderColor = ''), 2000)
            return
        }

        const situation = (situationInput?.value || DEFAULT_SITUATION).trim() || DEFAULT_SITUATION
        const hostDesc = (hostDescInput?.value || DEFAULT_HOST_DESC).trim() || DEFAULT_HOST_DESC
        const guestDesc = (guestDescInput?.value || DEFAULT_GUEST_DESC).trim() || DEFAULT_GUEST_DESC

        isHostTurn = true

        isRunning = true
        btnText.innerText = '⚙️Arrêter le Podcast'
        btnLoader.style.display = 'block'

        responseOutput.innerHTML = ''
        responseOutput.style.display = 'block'

        const systemPrompt = `
Tu génères un dialogue entre deux personnes, sur le thème : "${text}".
La situation est : ${situation}.

Rôles :
- Interlocuteur A = Hôte : ${hostDesc}.
- Interlocuteur B = Invité : ${guestDesc}.

Règles générales :
- Langue : Par défaut le français, sauf indication contraire.
- Registre soutenu, vocabulaire clair et précis.
- Dialogue naturel, chaque réplique rebondit sur la précédente.
- Chaque réplique est courte (20 à 40 mots), sans conclure la discussion.
- Tu ne dois jamais produire plusieurs répliques dans la même réponse : une seule réplique par tour.
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

    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendBtn.click()
        }
    })

    // Service worker registration for basic asset caching
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.warn('Service worker registration failed:', err)
        })
    }
})
