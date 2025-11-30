document.addEventListener("DOMContentLoaded", (e) => {
    e.preventDefault();

    const promptInput = document.getElementById('promptInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const btnText = sendBtn.querySelector('span');
    const btnLoader = document.getElementById('btnLoader');
    const responseOutput = document.getElementById('responseOutput');
    const footerYear = document.querySelector('.footer-year');
    if (footerYear) {
        footerYear.textContent = new Date().getFullYear();
    }
    

    // --- CONFIGURATION ---

    // ⚠️ ATTENTION : En production, ne jamais laisser une clé API côté client.
    const API_KEY = "sk-553d888c4f9b4bf8af4eedd580629f3d";
    const API_URL = "https://api.deepseek.com/chat/completions";

    // TTS : endpoints Piper HTTP
    // Tu peux inverser les URLs si tu veux Hôte=femme, Invité=homme.
    const TTS_HOST_URL = "https://ttsh.lagrandeclasse.fr/"; // Hôte -> femme
    const TTS_GUEST_URL = "https://ttsf.lagrandeclasse.fr/"; // Invité -> homme 

    let isRunning = false;            // Pour arrêter le podcast
    let conversationHistory = [];     // Historique pour le LLM

    // --- FONCTIONS IA ---

    // Appel DeepSeek (compatible OpenAI)
    const callDeepSeek = async (messages) => {
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: messages,
                    temperature: 0.9,
                    // max_tokens: 300
                })
            });

            if (!response.ok) {
                throw new Error(`Erreur API: ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error("Erreur lors de l'appel DeepSeek:", error);
            return null;
        }
    };

    // --- FONCTIONS TTS ---

    // Récupère l’URL de base TTS en fonction de l’interlocuteur
    const getTTSBaseUrlForSpeaker = (speaker) => {
        if (speaker === "Hôte") return TTS_HOST_URL;
        if (speaker === "Invité") return TTS_GUEST_URL;
        // fallback : Hôte
        return TTS_HOST_URL;
    };

    // Appelle le TTS et joue le son, puis résout la promesse quand l’audio est terminé
    const speakTextForSpeaker = async (speaker, text) => {
        try {
            const baseUrl = getTTSBaseUrlForSpeaker(speaker);
            const params = new URLSearchParams({
                text: text,
                format: "wav"
                // si besoin : speaker_id, etc.
            });

            const ttsUrl = `${baseUrl}?${params.toString()}`;

            const response = await fetch(ttsUrl);
            if (!response.ok) {
                throw new Error(`Erreur TTS (${speaker}): ${response.status}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            // On retourne une promesse qui se résout à la fin de la lecture
            return new Promise((resolve, reject) => {
                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                };
                audio.onerror = (err) => {
                    console.error("Erreur lecture audio:", err);
                    URL.revokeObjectURL(audioUrl);
                    resolve(); // on résout quand même pour ne pas bloquer la boucle
                };

                // Peut être bloqué si autoplay n’est pas autorisé, mais comme ça démarre après un clic, ça passe en général.
                audio.play().catch((err) => {
                    console.warn("Impossible de lancer l'audio (autoplay ?) :", err);
                    resolve(); // on ne bloque pas la boucle
                });
            });

        } catch (e) {
            console.error("Erreur TTS:", e);
            // On ne bloque pas la boucle si le TTS plante
            return;
        }
    };

    // --- UI ---

    const appendMessageToUI = (speaker, text) => {
        const msg_ia = document.createElement('div');
        msg_ia.style.marginBottom = "15px";
        msg_ia.style.padding = "10px";
        msg_ia.style.borderRadius = "8px";
        msg_ia.style.maxWidth = "85%";

        if (speaker === "Hôte") {
            msg_ia.style.backgroundColor = "#e0f2fe"; // Bleu clair
            msg_ia.style.borderLeft = "4px solid #0284c7";
            msg_ia.style.marginLeft = "0";
            msg_ia.innerHTML = `<strong>🎙️ Hôte :</strong> ${text}`;
        } else if (speaker === "Invité") {
            msg_ia.style.backgroundColor = "#f0fdf4"; // Vert clair
            msg_ia.style.borderLeft = "4px solid #16a34a";
            msg_ia.style.marginLeft = "auto";
            msg_ia.innerHTML = `<strong>🗣️ Invité :</strong> ${text}`;
        } else {
            // Pour les messages système / erreurs
            msg_ia.style.backgroundColor = "#fee2e2";
            msg_ia.style.borderLeft = "4px solid #b91c1c";
            msg_ia.style.marginLeft = "0";
            msg_ia.innerHTML = `<strong>⚠️ Système :</strong> ${text}`;
        }

        responseOutput.appendChild(msg_ia);
        responseOutput.scrollTop = responseOutput.scrollHeight;
    };

    // --- BOUCLE DE PODCAST ---

    const conversationLoop = async () => {
        if (!isRunning) return;

        // turnCount = nb de messages (y compris le system) déjà envoyés au modèle
        const turnCount = conversationHistory.length;
        // On alterne Hôte / Invité :
        // Après le system (index 0), premier tour => turnCount = 1 -> Hôte
        // puis Invité, etc.
        const currentSpeaker = (turnCount % 2 !== 0) ? "Hôte" : "Invité";

        try {
            const reply = await callDeepSeek(conversationHistory);

            if (!reply) {
                appendMessageToUI("Système", "Erreur de connexion à l'IA. Arrêt du podcast.");
                stopPodcast();
                return;
            }

            // 1. Affichage texte
            appendMessageToUI(currentSpeaker, reply);

            // 2. Lecture audio via TTS
            await speakTextForSpeaker(currentSpeaker, reply);

            // 3. Mise à jour de l’historique pour DeepSeek
            conversationHistory.push({
                role: "assistant",
                content: reply
            });

            // 4. On relance la boucle si toujours en cours
            if (isRunning) {
                conversationLoop();
            }

        } catch (e) {
            console.error(e);
            appendMessageToUI("Système", "Erreur interne. Arrêt du podcast.");
            stopPodcast();
        }
    };

    const stopPodcast = () => {
        isRunning = false;
        sendBtn.disabled = false;
        btnText.innerText = "Lancer le Podcast";
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    };

    // --- GESTIONNAIRES D'ÉVÉNEMENTS ---

    sendBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const text = promptInput.value.trim();

        // Si déjà en cours, clic = on arrête
        if (isRunning) {
            stopPodcast();
            return;
        }

        if (!text) {
            promptInput.focus();
            promptInput.style.borderColor = '#ef4444';
            setTimeout(() => promptInput.style.borderColor = '', 2000);
            return;
        }

        isRunning = true;
        btnText.innerText = "Arrêter le Podcast";
        btnLoader.style.display = 'block';

        responseOutput.innerHTML = "";
        responseOutput.style.display = 'block';

        const systemPrompt = `
            Tu vas simuler un podcast entre deux personnes sur le thème : "${text}".

            Rôles :
            - Interlocuteur A = Hôte : Polémique, énervé, pose des questions, relance le débat. Parle en francais en banlieue genre wesh.
            - Interlocuteur B = Invité : Expert ou passionné, donne des détails, anecdotes. 

            STYLE OBLIGATOIRE :
            - Réponds TOUJOURS en français.
            - 1 à 2 phrases maximum.
            - Réponse très courte : 20 à 40 mots maximum, idéalement ~30 mots.
            - Maximum 120 caractères environ.
            - Ne PAS commencer par "Hôte:" ou "Invité:", uniquement le texte parlé.
            - Ne jamais conclure la discussion, toujours laisser une ouverture.

            Exemples de longueur attendue :
            - "Bonne question ! En quelque mot,qu’on utilise l’IA pour automatiser les tâches les plus répétitives."
            - "Oui, exactement, et pour les débutants ça permet de progresser plus vite sans se perdre dans les détails techniques."

            Commence par une courte phrase de l’Hôte qui introduit le sujet.
        `;


        conversationHistory = [
            { role: "system", content: systemPrompt }
        ];

        console.log(`Démarrage du podcast sur: ${text}`);
        conversationLoop();
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (isRunning) {
                stopPodcast();
            }
            promptInput.value = "";
            responseOutput.innerHTML = "";
            responseOutput.style.display = "none";
            promptInput.focus();
        });
    }

    // Entrée pour lancer (Shift+Entrée autorise un saut de ligne)
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });
});
