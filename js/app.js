document.addEventListener("DOMContentLoaded", (e) => {
    e.preventDefault()
    const promptInput = document.getElementById('promptInput');
    const sendBtn = document.getElementById('sendBtn');
    const btnText = sendBtn.querySelector('span');
    const btnLoader = document.getElementById('btnLoader');
    const responseOutput = document.getElementById('responseOutput');

    // --- CONFIGURATION ---
    // ⚠️ ATTENTION : En production, ne jamais laisser une clé API côté client (visible par tous).
    // Pour ce prototype local, c'est acceptable.
    const API_KEY = "sk-553d888c4f9b4bf8af4eedd580629f3d";
    const API_URL = "https://api.deepseek.com/chat/completions"; // Endpoint standard compatible OpenAI

    let isRunning = false; // Pour pouvoir arrêter le podcast si besoin
    let conversationHistory = []; // Mémoire de la conversation

    // Fonction pour appeler l'API DeepSeek
    const callDeepSeek = async (messages) => {
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: "deepseek-chat", // Modèle DeepSeek V3 ou chat
                    messages: messages,
                    temperature: 0.7, // Créativité équilibrée
                    max_tokens: 300   // Limite la longueur des répliques pour du dynamisme
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

    // Fonction pour ajouter un message dans l'interface (Style Chat)
    const appendMessageToUI = (speaker, text) => {
        const msg_ia = document.createElement('div');
        msg_ia.style.marginBottom = "15px";
        msg_ia.style.padding = "10px";
        msg_ia.style.borderRadius = "8px";
        msg_ia.style.maxWidth = "85%";

        // Styles différents selon l'interlocuteur
        if (speaker === "Hôte") {
            msg_ia.style.backgroundColor = "#e0f2fe"; // Bleu clair
            msg_ia.style.borderLeft = "4px solid #0284c7";
            msg_ia.style.marginLeft = "0";
            msg_ia.innerHTML = `<strong>🎙️ Hôte :</strong> ${text}`;
        } else {
            msg_ia.style.backgroundColor = "#f0fdf4"; // Vert clair
            msg_ia.style.borderLeft = "4px solid #16a34a";
            msg_ia.style.marginLeft = "auto"; // Aligner à droite
            msg_ia.innerHTML = `<strong>🗣️ Invité :</strong> ${text}`;
        }

        responseOutput.appendChild(msg_ia);
        // Scroll automatique vers le bas
        responseOutput.scrollTop = responseOutput.scrollHeight;
    };

    // La boucle infinie du Podcast
    const conversationLoop = async () => {
        if (!isRunning) return;

        // Déterminer à qui le tour (Pair = Hôte, Impair = Invité)
        // On regarde la longueur de l'historique (moins le prompt système initial)
        const turnCount = conversationHistory.length;
        const currentSpeaker = (turnCount % 2 !== 0) ? "Hôte" : "Invité";

        // Ajout d'une instruction système "cachée" pour guider le prochain tour si nécessaire
        // (DeepSeek gère le contexte via l'historique, donc on envoie juste l'historique)

        try {
            const reply = await callDeepSeek(conversationHistory);

            if (reply) {
                // 1. Afficher
                appendMessageToUI(currentSpeaker, reply);

                // 2. Mettre à jour l'historique
                conversationHistory.push({ role: "assistant", content: reply });

                // 3. Petite pause artificielle pour le rythme (lecture)
                /* await new Promise(r => setTimeout(r, 2000)); */

                // 4. Relancer la boucle (Récursion)
                if (isRunning) conversationLoop();
            } else {
                appendMessageToUI("Système", "Erreur de connexion à l'IA. Arrêt du podcast.");
                stopPodcast();
            }

        } catch (e) {
            console.error(e);
            stopPodcast();
        }
    };

    const stopPodcast = () => {
        isRunning = false;
        sendBtn.disabled = false;
        btnText.innerText = "Lancer le Podcast"; // Remettre le texte initial
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    };

    // Gestionnaire d'événement
    sendBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        const text = promptInput.value.trim();

        // Si déjà en cours, on arrête
        if (isRunning) {
            stopPodcast();
            return;
        }

        // 1. Validation basique
        if (!text) {
            promptInput.focus();
            promptInput.style.borderColor = '#ef4444';
            setTimeout(() => promptInput.style.borderColor = '', 2000);
            return;
        }

        // 2. État de chargement & Démarrage
        isRunning = true;
        // On change le bouton en bouton "Arrêter"
        btnText.innerText = "Arrêter le Podcast";
        btnLoader.style.display = 'block'; // On garde le loader pour montrer l'activité

        // Reset de l'affichage
        responseOutput.innerHTML = "";
        responseOutput.style.display = 'block';

        // 3. Initialisation du "System Prompt" (Le scénario)
        // On définit les règles du jeu pour DeepSeek
        const systemPrompt = `
            Tu vas simuler un podcast entre deux personnes sur le thème : "${text}".
            
            Les règles :
            1. Interlocuteur A (Hôte) : Curieux, pose des questions, relance le débat.
            2. Interlocuteur B (Invité) : Expert ou passionné, donne des détails, des anecdotes.
            3. Format : Conversationnel, dynamique, réponses brèves(max 3 phrases).
            4. Ne mets pas de préfixes comme "Hôte:" ou "Invité:", réponds juste avec le texte parlé.
            5. La conversation doit être infinie, ne jamais conclure définitivement.
            
            Commence par l'Hôte qui introduit le sujet.
        `;

        conversationHistory = [
            { role: "system", content: systemPrompt }
        ];

        // Lancement de la boucle
        console.log(`Démarrage du podcast sur: ${text}`);

        // Premier appel pour lancer la machine (L'hôte commence)
        conversationLoop();
    });

    // Petit bonus UX : Ctrl+Enter pour envoyer
    promptInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            sendBtn.click();
        }
    });
});