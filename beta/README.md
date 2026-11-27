# Bêta de synchronisation des tâches : procédure et critères

Date : 27 novembre 2026. Cette bêta est isolée dans /beta. Elle n'est pas intégrée à l'application familiale existante ni déployée.

## Ce qui est implémenté

- Page indépendante beta/index.html et script beta/beta.js.
- Firebase Auth par e-mail et mot de passe pour des comptes de TEST créés par l'administrateur.
- Tâches personnelles dans users/{uid}/tasks.
- Tâches communes dans households/{householdId}/tasks.
- Contrôle de la présence d'un membre actif dans households/{householdId}/members/{uid}.
- Réception des changements Firestore en temps réel, ajout, cases à cocher et suppression.
- Règles fermées par défaut, définies dans firebase/firestore-beta.rules.
- Refus explicite de la configuration courses-famille-b9169 utilisée actuellement en production.
- Pas de données CABS, de budget, de clé OpenAI ou de migration.

## Installation manuelle dans un environnement distinct

1. Créer un nouveau projet Firebase, exclusivement pour le développement, avec un nom distinct de courses-famille-b9169.
2. Dans ce projet de test uniquement, activer Authentication > Sign-in method > Email/Password. Ajouter deux comptes fictifs et relever leurs UID.
3. Activer Cloud Firestore sur ce projet et publier les règles firebase/firestore-beta.rules uniquement sur cette nouvelle base. Ne pas remplacer les règles Firestore de production.
4. Dans Firestore, créer un foyer de test à identifiant alphanumérique (exemple : foyer-demo).
5. Pour chaque compte de test, créer le document households/foyer-demo/members/{uid} avec le champ boolean active = true depuis la Console Firebase (ou un script Admin SDK de confiance). Le client ne peut ni créer ni modifier ces documents.
6. Servir les fichiers beta/index.html et beta/beta.js sur un serveur HTTPS de test. La branche de développement n'est pas automatiquement servie par GitHub Pages. Le fichier beta/beta.js utilise des imports JavaScript ES modules.
7. Renseigner dans l'interface uniquement les paramètres de configuration publique du projet Firebase de TEST (apiKey, authDomain, projectId et appId), puis le nom du foyer de test. Ne pas renseigner de secret de compte de service.
8. Se connecter avec les deux comptes de test, sur deux sessions distinctes.

L'application n'embarque aucun identifiant d'administrateur. Le formulaire de configuration est volontairement manuel pour éviter toute connexion involontaire à la base existante.

## Tests fonctionnels à réaliser avant toute intégration

- [ ] Compte A crée une tâche familiale. Le compte B la voit en temps réel.
- [ ] B coche la tâche. A voit le nouvel état après synchronisation.
- [ ] A crée une tâche personnelle. B ne peut pas la lire, même via un accès Firestore direct.
- [ ] B crée une tâche personnelle. A ne peut pas la lire.
- [ ] Un compte C authentifié mais non membre ne peut ni lire, ni écrire, ni supprimer les tâches familiales.
- [ ] Un membre ne peut pas se créer un membership, activer un membership désactivé ou changer celui d'autrui.
- [ ] Les données mal formées sont refusées : champ inconnu, titre vide ou trop long, dates hors format, catégorie interdite.
- [ ] Un compte ne peut pas falsifier createdBy ou createdAt d'une tâche existante.
- [ ] Les tentatives de lecture des anciennes collections familles/{code}/... échouent dans le projet de test.
- [ ] La modification du projet réel courses-famille-b9169 est refusée dès le chargement de la configuration.
- [ ] La déconnexion empêche la consultation des données privées.
- [ ] Aucun document relatif à un élève ou au personnel CABS n'est envoyé durant les tests.

## Points non résolus avant production

- Les règles Firebase actuelles du projet familial n'ont pas encore été consultées ni sauvegardées.
- Aucun export Firestore de production n'a été réalisé.
- Aucun compte réel de la famille n'a été créé.
- Aucune migration du code famille actuel vers Firebase Authentication n'est entreprise.
- Une stratégie de migration réversible, y compris accès hors ligne et multidevice, reste nécessaire.
- Il faudra une authentification sécurisée et une couche serveur dédiée pour les opérations IA et vocales.
- Des tests automatisés dans un émulateur Firestore seraient nécessaires avant le déploiement.
- Cette bêta nécessite un projet et une configuration Firebase de test fournis par le propriétaire. Aucun test d'accès réel à Firebase n'a été réalisé depuis GitHub.

## Séparation

Le futur module commun reprendra les tâches partagées. L'espace professionnel CABS sera limité à users/{uid}/tasks avec category = work; aucune autorisation de lecture n'est accordée à un autre compte. Les modifications de code ou d'autorisations restent administratives, exclusivement côté GitHub/backend.
