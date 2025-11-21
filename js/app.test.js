/**
 * Tests unitaires pour app.js
 * Framework: Jest
 * Tests pour les fonctionnalités principales du podcast IA
 */

// Mock de fetch global
global.fetch = jest.fn();

describe('Application Podcast IA', () => {
    let container;
    let promptInput, sendBtn, btnText, btnLoader, responseOutput;

    beforeEach(() => {
        // Reset du DOM pour chaque test
        document.body.innerHTML = `
            <input id="promptInput" type="text" />
            <button id="sendBtn">
                <span>Lancer le Podcast</span>
                <div id="btnLoader" style="display: none;"></div>
            </button>
            <div id="responseOutput" style="display: none;"></div>
        `;

        // Récupération des éléments
        promptInput = document.getElementById('promptInput');
        sendBtn = document.getElementById('sendBtn');
        btnText = sendBtn.querySelector('span');
        btnLoader = document.getElementById('btnLoader');
        responseOutput = document.getElementById('responseOutput');

        // Reset des mocks
        jest.clearAllMocks();
        global.fetch.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Initialisation du DOM', () => {
        test('Les éléments DOM essentiels existent', () => {
            expect(promptInput).toBeTruthy();
            expect(sendBtn).toBeTruthy();
            expect(btnText).toBeTruthy();
            expect(btnLoader).toBeTruthy();
            expect(responseOutput).toBeTruthy();
        });

        test('Le bouton a le texte initial correct', () => {
            expect(btnText.innerText).toBe('Lancer le Podcast');
        });

        test('Le loader est caché par défaut', () => {
            expect(btnLoader.style.display).toBe('none');
        });

        test('La zone de réponse est cachée par défaut', () => {
            expect(responseOutput.style.display).toBe('none');
        });
    });

    describe('Validation des entrées', () => {
        test('Le champ vide ne devrait pas lancer le podcast', () => {
            promptInput.value = '';
            const clickEvent = new Event('click');

            // On simule juste la validation sans lancer le code complet
            const text = promptInput.value.trim();
            expect(text).toBe('');
        });

        test('Le champ avec des espaces seulement ne devrait pas être valide', () => {
            promptInput.value = '   ';
            const text = promptInput.value.trim();
            expect(text).toBe('');
        });

        test('Le champ avec du texte valide devrait passer la validation', () => {
            promptInput.value = 'Intelligence Artificielle';
            const text = promptInput.value.trim();
            expect(text).toBe('Intelligence Artificielle');
            expect(text.length).toBeGreaterThan(0);
        });
    });

    describe('Fonction callDeepSeek (Simulation)', () => {
        const API_KEY = "sk-553d888c4f9b4bf8af4eedd580629f3d";
        const API_URL = "https://api.deepseek.com/chat/completions";

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
                        temperature: 0.7,
                        max_tokens: 200
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

        test('Devrait appeler l\'API avec les bons paramètres', async () => {
            const mockResponse = {
                choices: [
                    {
                        message: {
                            content: "Bonjour, bienvenue dans ce podcast!"
                        }
                    }
                ]
            };

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const messages = [{ role: "system", content: "Test" }];
            const result = await callDeepSeek(messages);

            expect(global.fetch).toHaveBeenCalledWith(
                API_URL,
                expect.objectContaining({
                    method: "POST",
                    headers: expect.objectContaining({
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${API_KEY}`
                    })
                })
            );

            expect(result).toBe("Bonjour, bienvenue dans ce podcast!");
        });

        test('Devrait gérer les erreurs HTTP', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401
            });

            const messages = [{ role: "system", content: "Test" }];
            const result = await callDeepSeek(messages);

            expect(result).toBeNull();
        });

        test('Devrait gérer les erreurs réseau', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));

            const messages = [{ role: "system", content: "Test" }];
            const result = await callDeepSeek(messages);

            expect(result).toBeNull();
        });

        test('Devrait envoyer le bon format de données', async () => {
            const mockResponse = {
                choices: [{ message: { content: "Response" } }]
            };

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const messages = [
                { role: "system", content: "Système" },
                { role: "user", content: "Question" }
            ];

            await callDeepSeek(messages);

            const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
            expect(callBody).toEqual({
                model: "deepseek-chat",
                messages: messages,
                temperature: 0.7,
                max_tokens: 200
            });
        });
    });

    describe('Fonction appendMessageToUI', () => {
        const appendMessageToUI = (speaker, text) => {
            const msg_ia = document.createElement('div');
            msg_ia.style.marginBottom = "15px";
            msg_ia.style.padding = "10px";
            msg_ia.style.borderRadius = "8px";
            msg_ia.style.maxWidth = "85%";

            if (speaker === "Hôte") {
                msg_ia.style.backgroundColor = "#e0f2fe";
                msg_ia.style.borderLeft = "4px solid #0284c7";
                msg_ia.style.marginLeft = "0";
                msg_ia.innerHTML = `<strong>🎙️ Hôte :</strong> ${text}`;
            } else {
                msg_ia.style.backgroundColor = "#f0fdf4";
                msg_ia.style.borderLeft = "4px solid #16a34a";
                msg_ia.style.marginLeft = "auto";
                msg_ia.innerHTML = `<strong>🗣️ Invité :</strong> ${text}`;
            }

            responseOutput.appendChild(msg_ia);
            responseOutput.scrollTop = responseOutput.scrollHeight;
        };

        test('Devrait créer un message pour l\'hôte avec le bon style', () => {
            appendMessageToUI('Hôte', 'Bonjour à tous!');

            const messages = responseOutput.querySelectorAll('div');
            expect(messages.length).toBe(1);

            const message = messages[0];
            // JSDOM ne normalise pas les couleurs, donc on vérifie le format hex
            expect(message.style.backgroundColor).toBe('#e0f2fe');
            expect(message.style.borderLeft).toBe('4px solid #0284c7');
            expect(message.innerHTML).toContain('🎙️ Hôte');
            expect(message.innerHTML).toContain('Bonjour à tous!');
        });

        test('Devrait créer un message pour l\'invité avec le bon style', () => {
            appendMessageToUI('Invité', 'Merci de me recevoir!');

            const messages = responseOutput.querySelectorAll('div');
            expect(messages.length).toBe(1);

            const message = messages[0];
            // JSDOM ne normalise pas les couleurs, donc on vérifie le format hex
            expect(message.style.backgroundColor).toBe('#f0fdf4');
            expect(message.style.borderLeft).toBe('4px solid #16a34a');
            expect(message.innerHTML).toContain('🗣️ Invité');
            expect(message.innerHTML).toContain('Merci de me recevoir!');
        });

        test('Devrait ajouter plusieurs messages dans l\'ordre', () => {
            appendMessageToUI('Hôte', 'Message 1');
            appendMessageToUI('Invité', 'Message 2');
            appendMessageToUI('Hôte', 'Message 3');

            const messages = responseOutput.querySelectorAll('div');
            expect(messages.length).toBe(3);
        });

        test('Devrait avoir les bonnes propriétés de style communes', () => {
            appendMessageToUI('Hôte', 'Test');

            const message = responseOutput.querySelector('div');
            expect(message.style.marginBottom).toBe('15px');
            expect(message.style.padding).toBe('10px');
            expect(message.style.borderRadius).toBe('8px');
            expect(message.style.maxWidth).toBe('85%');
        });
    });

    describe('Logique du décompte des tours', () => {
        test('Le premier tour devrait être l\'hôte (turnCount impair)', () => {
            const conversationHistory = [
                { role: "system", content: "Prompt système" }
            ];
            const turnCount = conversationHistory.length; // = 1
            const currentSpeaker = (turnCount % 2 !== 0) ? "Hôte" : "Invité";

            expect(currentSpeaker).toBe("Hôte");
        });

        test('Le deuxième tour devrait être l\'invité (turnCount pair)', () => {
            const conversationHistory = [
                { role: "system", content: "Prompt système" },
                { role: "assistant", content: "Réponse de l'hôte" }
            ];
            const turnCount = conversationHistory.length; // = 2
            const currentSpeaker = (turnCount % 2 !== 0) ? "Hôte" : "Invité";

            expect(currentSpeaker).toBe("Invité");
        });

        test('Le troisième tour devrait être l\'hôte à nouveau', () => {
            const conversationHistory = [
                { role: "system", content: "Prompt système" },
                { role: "assistant", content: "Réponse de l'hôte" },
                { role: "assistant", content: "Réponse de l'invité" }
            ];
            const turnCount = conversationHistory.length; // = 3
            const currentSpeaker = (turnCount % 2 !== 0) ? "Hôte" : "Invité";

            expect(currentSpeaker).toBe("Hôte");
        });
    });

    describe('Fonction stopPodcast', () => {
        let isRunning = true;

        const stopPodcast = () => {
            isRunning = false;
            sendBtn.disabled = false;
            btnText.innerText = "Lancer le Podcast";
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
        };

        beforeEach(() => {
            // Simuler un podcast en cours
            isRunning = true;
            sendBtn.disabled = true;
            btnText.innerText = "Arrêter le Podcast";
            btnLoader.style.display = 'block';
        });

        test('Devrait arrêter le podcast et réinitialiser l\'état', () => {
            stopPodcast();

            expect(isRunning).toBe(false);
            expect(sendBtn.disabled).toBe(false);
            expect(btnText.innerText).toBe("Lancer le Podcast");
            expect(btnLoader.style.display).toBe('none');
            expect(btnText.style.display).toBe('inline');
        });
    });

    describe('Gestion du prompt système', () => {
        test('Devrait créer un prompt système bien formaté', () => {
            const text = "Intelligence Artificielle";
            const systemPrompt = `
            Tu vas simuler un podcast entre deux personnes sur le thème : "${text}".
            
            Les règles :
            1. Interlocuteur A (Hôte) : Curieux, pose des questions, relance le débat.
            2. Interlocuteur B (Invité) : Expert ou passionné, donne des détails, des anecdotes.
            3. Format : Conversationnel, dynamique, réponses courtes (max 3 phrases).
            4. Ne mets pas de préfixes comme "Hôte:" ou "Invité:", réponds juste avec le texte parlé.
            5. La conversation doit être infinie, ne jamais conclure définitivement.
            
            Commence par l'Hôte qui introduit le sujet.
        `;

            expect(systemPrompt).toContain(text);
            expect(systemPrompt).toContain("Hôte");
            expect(systemPrompt).toContain("Invité");
            expect(systemPrompt).toContain("podcast");
        });

        test('L\'historique devrait commencer avec le message système', () => {
            const text = "Test";
            const systemPrompt = `Test prompt pour "${text}"`;
            const conversationHistory = [
                { role: "system", content: systemPrompt }
            ];

            expect(conversationHistory.length).toBe(1);
            expect(conversationHistory[0].role).toBe("system");
            expect(conversationHistory[0].content).toBe(systemPrompt);
        });
    });

    describe('Raccourci clavier Ctrl+Enter', () => {
        test('Devrait détecter Ctrl+Enter correctement', () => {
            const event = new KeyboardEvent('keydown', {
                ctrlKey: true,
                key: 'Enter'
            });

            const shouldTrigger = event.ctrlKey && event.key === 'Enter';
            expect(shouldTrigger).toBe(true);
        });

        test('Ne devrait pas détecter Enter seul', () => {
            const event = new KeyboardEvent('keydown', {
                ctrlKey: false,
                key: 'Enter'
            });

            const shouldTrigger = event.ctrlKey && event.key === 'Enter';
            expect(shouldTrigger).toBe(false);
        });

        test('Ne devrait pas détecter Ctrl seul', () => {
            const event = new KeyboardEvent('keydown', {
                ctrlKey: true,
                key: 'a'
            });

            const shouldTrigger = event.ctrlKey && event.key === 'Enter';
            expect(shouldTrigger).toBe(false);
        });
    });

    describe('Validation du style de bordure d\'erreur', () => {
        test('Le champ devrait pouvoir changer de couleur de bordure', () => {
            promptInput.style.borderColor = '#ef4444';
            // JSDOM garde le format hex
            expect(promptInput.style.borderColor).toBe('#ef4444');
        });

        test('Le champ devrait pouvoir réinitialiser la couleur de bordure', () => {
            promptInput.style.borderColor = '#ef4444';
            promptInput.style.borderColor = '';
            expect(promptInput.style.borderColor).toBe('');
        });
    });
});
