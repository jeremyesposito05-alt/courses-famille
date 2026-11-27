# Refonte Famille : cadrage V1

Date : 27 novembre 2026
Branche : develop/refonte-famille-hub-ia
Référence de sauvegarde : backup/avant-refonte-2026-11-27 (7023be4cba133e88d870931f48a57dbe81022dfa)

## Objectif

Faire évoluer la PWA "Famille" existante vers un centre d'organisation familial et personnel, avec agenda, tâches, budget, courses, menus, projets et assistant IA vocal/textuel.

L'application en production sur main ne doit pas être modifiée avant une validation séparée. Préserver intégralement les données Firestore existantes et les calculs financiers.

## Existant vérifié (lecture du code, 27/11/2026)

- HTML/CSS/JavaScript sans framework : index.html, app.js.
- Modules séparés : agenda.js, budget.js, recettes.js.
- Firebase Firestore, listeners onSnapshot, cache persistant hors ligne.
- Agenda familial avec attribution des personnes, répétitions, exceptions, pauses vacances, notes hebdomadaires.
- PWA avec service worker, manifest et installation iOS.
- Budget : prorata, factures récurrentes, paiements, simulation et projets.
- Authentification actuelle par code famille et choix local Papa/Maman. Les règles Firestore réelles n'ont pas été auditées.

## Règles de sécurité avant mise en production

1. Introduire Firebase Authentication avec comptes individuels pour les deux parents.
2. Créer des espaces distincts : données familiales partagées, données privées de chaque utilisateur.
3. Définir et tester des règles Firestore : utilisateur connecté, membre du foyer, propriétaire des données.
4. Ne jamais placer de clé API secrète OpenAI ou de compte de service dans le code GitHub ou le navigateur.
5. Faire passer les appels IA et écritures sensibles par un backend contrôlant l'identité et les autorisations.
6. Interdire à l'assistant familial l'accès aux données CABS privées de l'autre utilisateur.
7. Vérifier les politiques de confidentialité, de rétention et d'autorisation avant toute ingestion de données scolaires.
8. Faire une sauvegarde/export Firestore distinct du snapshot GitHub avant toute migration des données.
9. Conserver les opérations du budget existant isolées des nouvelles fonctionnalités.
10. La permission d'administration technique n'est accordée qu'au propriétaire du projet, pas au compte familial membre.

### Schéma cible (proposition, non appliquée)

- /households/{householdId}/members/{uid} : droits des membres
- /households/{householdId}/events/{eventId} : agenda commun
- /households/{householdId}/tasks/{taskId} : tâches communes
- /users/{uid}/events/{eventId} : événements privés
- /users/{uid}/tasks/{taskId} : tâches privées
- /users/{uid}/projects/{projectId} : projets privés
- /users/{uid}/imports/{importId} : lots d'import proposés, provenance et statut
- Collections existantes /familles/{code}/... : conservées jusqu'à une migration validée et testée.

## Hub central (UX)

- Accueil « Aujourd'hui » : calendrier du jour, tâches prioritaires, alertes, prochains événements.
- Tuiles principales : Agenda, Tâches, Budget, Courses, Menus, Projets.
- Navigation tactile : hub visible en un geste, raccourcis et bouton « + » accessibles.
- Assistant intégré : saisie texte et, dans une phase suivante, conversation vocale.
- Codes couleurs sobres, micro-interactions rapides, accessibilité, grands boutons, mode sombre facultatif.
- Des vues Famille, Personnel, Travail, et « Tout » filtrées selon les permissions.

## Assistant IA intégré

Canaux : texte et voix dans la PWA. Conversation ChatGPT partagée non nécessaire.

Flux : identification de l'utilisateur -> réception du message/document -> extraction structurée -> détection des doublons -> prévisualisation des actions -> validation des opérations significatives -> vérification des droits côté serveur -> écriture Firestore -> accusé de réception.

- Deux personnes peuvent ajouter/modifier leurs contenus autorisés.
- La personne membre ne peut pas demander des changements de code, droits ou configuration.
- Une demande visant les données privées d'autrui est refusée côté serveur.
- Les événements importés stockent la source, l'identifiant externe éventuel, l'auteur, le statut confirmé/provisoire, la date de mise à jour.
- Ne jamais supprimer ou décocher implicitement une tâche par simple réimportation.
- Les modifications ambiguës restent en attente de validation.

## Ordre de réalisation

1. Sauvegarde GitHub et branche de développement : effectué le 27/11/2026.
2. Prototype UX autonome du nouveau hub, sans connexion à la production.
3. Test local de la navigation, lisibilité iPhone et de l'ergonomie.
4. Authentification Firebase et règles d'accès testées avec deux comptes de test.
5. Sauvegarde Firestore, plan de migration réversible et séparation données communes/privées.
6. Module de tâches avec échéances, statuts, cases à cocher, historiques et vues.
7. Intégration prudente dans l'accueil et l'agenda existants.
8. Assistant IA texte avec authentification, actions limitées, journal et confirmations.
9. Voix temps réel et rappels/notifications selon capacités iOS.
10. Tests du budget, courses, menus, agenda, modes hors ligne et synchronisation multi-appareils.
11. Validation du propriétaire, puis déploiement contrôlé sur main.

## Hors périmètre immédiat

- Aucune écriture dans la base Firebase réelle.
- Aucune migration ni suppression de données.
- Aucune modification de la branche main.
- Aucune clé API ou information confidentielle dans GitHub.
- Aucune promesse de synchronisation ChatGPT ou de voix fonctionnelles avant développement et test.
