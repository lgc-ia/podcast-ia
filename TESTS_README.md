# Guide d'Utilisation des Tests Unitaires

## Installation

```bash
npm install
```

## Commandes de Test

### Lancer tous les tests
```bash
npm test
```

### Mode watch (relance automatique)
```bash
npm run test:watch
```

### Générer un rapport de couverture
```bash
npm run test:coverage
```

## Résultats Actuels

- ✅ **23/26 tests (88%)** passent avec succès
- ⚠️ 3 tests ont des assertions liées aux couleurs CSS (différence JSDOM vs navigateur réel)

## Structure des Tests

```
js/
├── app.js          # Code source
└── app.test.js     # Tests unitaires
```

## Couverture des Tests

Les tests couvrent:
- ✅ Initialisation du DOM
- ✅ Validation des entrées utilisateur
- ✅ Appels API (callDeepSeek)
- ✅ Rendu des messages UI
- ✅ Logique métier (alternance hôte/invité)
- ✅ Fonction d'arrêt du podcast
- ✅ Gestion du prompt système
- ✅ Raccourcis clavier
- ✅ Gestion des erreurs

## Note Importante

Les 3 tests qui échouent sont dus à une différence de normalisation des couleurs CSS entre JSDOM (environnement de test) et les vrais navigateurs. Cette différence n'affecte pas le fonctionnement réel de l'application.
