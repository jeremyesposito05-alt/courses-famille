# Tests de sécurité Firestore, projet Famille

Ce dossier ne communique pas avec votre projet Firebase de production. Il utilise exclusivement un émulateur local et l'identifiant fictif `demo-famille-rules-tests`.

## Lancement

Pré-requis : Node.js 22 et Java 21.

```bash
cd security-tests
npm install
npm run test:rules
```

Le script démarre Firestore Emulator, charge les règles `../firebase/firestore-beta.rules`, puis exécute les tests Node. L'exécution échoue si la variable `FIRESTORE_EMULATOR_HOST` est absente.

## Scénarios couverts

- Deux membres voient et peuvent cocher les tâches du foyer.
- Un utilisateur extérieur ne peut pas consulter ou modifier les tâches communes.
- Un membre désactivé n'a plus de droit de lecture ni d'écriture.
- Les tâches personnelles et professionnelles de chacun sont privées.
- Les documents d'appartenance au foyer ne peuvent pas être créés ou modifiés depuis le navigateur.
- Les données mal formées, champs inattendus et modifications d'attribution sont rejetés.
- Les collections historiques `/familles/...` sont refusées dans la base de test.
- Une personne non authentifiée ne peut pas lire les tâches.

## Intégration continue

`.github/workflows/firestore-beta-tests.yml` exécute ces tests lors de modifications pertinentes sur la branche de développement et sur les pull requests.

Le fichier de workflow a été ajouté à GitHub, mais la réussite d'une exécution GitHub Actions reste à vérifier. La suite de tests n'a pas été exécutée sur un émulateur dans cette session.

## Conditions avant migration réelle

1. Résultats positifs des tests automatisés et tests manuels avec deux comptes fictifs.
2. Sauvegarde indépendante et vérifiée de Firestore production.
3. Audit des règles de production, inconnu actuellement.
4. Comptes Firebase Auth individuels, droits administratifs distribués côté serveur.
5. Procédure de migration réversible et tests iPhone, en ligne et hors ligne.
6. Intégration de la logique `tasks-demo.js` avec un adaptateur de stockage, sans changer budget.js ni agenda.js au départ.

Aucune commande de ce dossier ne déploie des règles dans un projet distant.
