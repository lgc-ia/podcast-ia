document.addEventListener("DOMContentLoaded", () => {
    const promptInput = document.getElementById('promptInput');
    const sendBtn = document.getElementById('sendBtn');
    const btnText = sendBtn.querySelector('span');
    const btnLoader = document.getElementById('btnLoader');
    const responseOutput = document.getElementById('responseOutput');

    // Fonction pour simuler un appel API (délai artificiel)
    const simulateApiCall = (text) => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(`J'ai bien reçu votre prompt : "${text}". Voici une réponse générée par le système.`);
            }, 2000); // 2 secondes d'attente
        });
    };

    // Gestionnaire d'événement
    sendBtn.addEventListener('click', async () => {
        const text = promptInput.value.trim();

        // 1. Validation basique
        if (!text) {
            promptInput.focus();
            promptInput.style.borderColor = '#ef4444'; // Rouge si vide
            setTimeout(() => promptInput.style.borderColor = '', 2000);
            return;
        }

        // 2. État de chargement (UI Update)
        sendBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'block';
        responseOutput.style.display = 'none';

        try {
            // 3. Simulation de l'envoi
            console.log(`Envoi du prompt: ${text}`);
            const response = await simulateApiCall(text);

            // 4. Affichage du résultat
            responseOutput.innerText = response;
            responseOutput.style.display = 'block';

            // Optionnel : Vider le champ
            // promptInput.value = ''; 

        } catch (error) {
            console.error("Erreur simulée", error);
        } finally {
            // 5. Rétablissement de l'interface
            sendBtn.disabled = false;
            btnText.style.display = 'block';
            btnLoader.style.display = 'none';
        }
    });

    // Petit bonus UX : Ctrl+Enter pour envoyer
    promptInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            sendBtn.click();
        }
    });
})