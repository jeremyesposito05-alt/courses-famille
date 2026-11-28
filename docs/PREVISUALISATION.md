# Prévisualisation indépendante de Famille

État vérifié les 27 et 28 novembre 2026. Branche de travail : `preview/refonte-iphone`, issue de `develop/refonte-famille-hub-ia` au commit `cb7f83a642bdb3eb8c8a0a92fce8a126b8168f2c`.

Adresse HTTPS publiée avec succès le 28 novembre 2026 : https://courses-famille-apercu-20261127.cabs-9998.chatgpt.site

Ce site indépendant est privé : ouvrir l'adresse dans Safari avec le compte ChatGPT propriétaire. Cette protection de l'hébergement ne remplace pas l'authentification individuelle Papa/Maman à développer. La version hébergée contient uniquement les 14 fichiers statiques de la liste autorisée de `scripts/build-preview.mjs` ; les fichiers Firebase de préparation ne sont pas publiés. Pour reconstruire : `node scripts/build-preview.mjs`.

Cette branche sert à tester la refonte avec des données fictives. **Ne pas fusionner directement cette branche dans `main`** : ses imports Firebase ont volontairement été remplacés par un stockage local. Les améliorations destinées à la production devront être reprises séparément, après validation et préparation d'une authentification individuelle.

## Isolation et conservation de l'existant

- `app.js`, `agenda.js` et `budget.js` utilisent `preview-store.js`, sans SDK Firebase, clé, appel réseau ou connexion à une base distante. Le seul foyer accepté par cet adaptateur est `familles/preview-demo`.
- Les modules historiques de courses, repas, recettes, budget et agenda restent présents. Pour `agenda.js` et `budget.js`, le changement fonctionnel de cette branche est le remplacement de l'import de stockage ; leurs calculs et formulaires sont conservés.
- Les exemples de courses, agenda, repas et budget sont créés localement au premier lancement. Aucune copie des données de production n'a été chargée.
- La base fictive est enregistrée sous `cf.preview.database.v1`. Les priorités utilisent `cf.preview.todos.v2`, et les préférences le préfixe `cf.preview.`. Une actualisation normale conserve les données enregistrées.
- Le stockage est propre au navigateur et à l'adresse du site. Effacer les données de Safari, changer de navigateur ou utiliser un autre iPhone ne retrouve pas ces données. La démonstration ne synchronise pas les deux iPhone.
- La politique de sécurité de `index.html` limite les scripts et connexions à la même origine. Les polices externes ont été retirées. L'application de prévisualisation ne peut donc pas charger le SDK Firebase distant ou contacter ses services depuis cette page.
- Le manifeste identifie l'installation comme « Famille Essai ». Le service worker utilise un cache `cf-preview-…` et ne supprime que les anciennes versions de ce cache. Le site doit rester hébergé à une adresse indépendante de l'application familiale.
- `beta/`, `firebase/firestore-beta.rules` et `security-tests/` restent des préparations séparées. Ils ne sont pas importés par la prévisualisation. Aucune règle n'a été déployée, aucune donnée Firebase de production n'a été lue ou écrite.

Les références locales récupérées de `main` et `backup/avant-refonte-2026-11-27` pointent toutes deux sur `7023be4cba133e88d870931f48a57dbe81022dfa`. Aucune modification de ces branches n'est nécessaire pour publier cet aperçu. Le maintien des références distantes doit être vérifié lors de la livraison.

## Interface et comportement

Le Hub reprend le design feutre validé : couleurs soutenues, contours ardoise, ombres pleines et bouton orange dominant « Mes priorités ». Il accueille le profil choisi, présente un résumé compact et permet d'ouvrir Agenda, Courses, Budget et Repas.

L'écran Priorités propose les catégories Famille, Pro et Général, l'importance, une échéance, les filtres Toutes/Urgentes/Aujourd'hui/Terminées, le cochage et décochage, une suppression confirmée et des compteurs actualisés. Le formulaire apparaît uniquement à la demande. Les tâches familiales sont communes aux deux profils de démonstration sur le même navigateur ; les listes personnelles sont distinctes.

Le profil Maman ne présente pas la catégorie Pro. **Cela ne constitue pas une protection des données** : chacun peut changer le profil affiché, et le stockage local est consultable par la personne qui utilise le navigateur. Ne saisir aucune information privée ou professionnelle réelle dans cet aperçu.

Le bouton Retour reste dans l'en-tête fixe pendant le défilement. La navigation principale conserve l'accès au Hub et utilise l'historique du navigateur. Les fenêtres de saisie possèdent leur propre bouton Retour.

L'assistant IA ouvre un panneau indiquant explicitement qu'il n'est pas connecté. Il n'y a ni envoi de texte à un modèle, ni capture de voix, ni clé secrète côté navigateur, ni fonction permettant de modifier le code.

## Tests effectués

Commande exécutée à la racine du dépôt :

```powershell
node --test --test-isolation=none tests/preview-store.test.mjs tests/priorities.test.mjs
```

**Résultat : 17 tests réussis, aucun échec.** L'option sans isolation de processus permet de fonctionner dans cet environnement Windows où le lancement de sous-processus par le runner standard est refusé.

Les tests couvrent le foyer fictif exclusif, les exemples initiaux, la persistance après rechargement, les écritures imbriquées, les fusions, les suppressions, les abonnements et filtres, les exclusions récurrentes et les lots atomiques. Ils vérifient aussi les priorités, les profils fictifs, les compteurs, les dates et titres invalides, l'échappement du texte, la confirmation de suppression, l'ouverture du formulaire à la demande et les erreurs de stockage. Les données de priorité illisibles sont conservées plutôt qu'écrasées.

Les contrôles `node --check` ont réussi pour neuf fichiers : `app.js`, `agenda.js`, `budget.js`, `recettes.js`, `tasks-demo.js`, `preview-store.js`, `bootstrap.js`, `sw.js` et `beta/beta.js`.

Tests d'interface effectués dans le navigateur de travail par l'agent principal :

- Chargement complet, navigation Hub/Priorités/Agenda et bouton Retour : réussis.
- Création d'une priorité urgente, filtrage, cochage/décochage, persistance après actualisation et suppression confirmée : réussis.
- Accès aux écrans Courses, Budget et Menus : réussi.
- Profil Maman sans catégorie Pro et panneau d'assistant explicitement non connecté : vérifiés.
- Largeurs effectives de 375 et 390 pixels, sans débordement horizontal : vérifiées.
- Aucune erreur JavaScript observée dans la console pendant ces parcours.

Ces contrôles ne constituent pas une recette exhaustive des calculs et opérations des modules historiques.

## Vérifications et développements restants

- Safari sur un iPhone physique n'a pas été testé dans cette intervention. Vérifier en particulier le clavier, les champs de date, les gestes Retour, les zones de sécurité, l'installation sur l'écran d'accueil et la reprise après mise en veille.
- Le fonctionnement hors ligne après installation et les mises à jour de cache restent à vérifier sur Safari réel.
- Les tests Firebase existants n'ont pas été exécutés ici : leurs dépendances et l'environnement Java/émulateur ne sont pas installés. Aucun résultat de sécurité Firebase n'est revendiqué pour cette intervention.
- L'authentification individuelle, les règles réellement déployées et testées pour chaque compte, les droits professionnels de Papa et la synchronisation entre appareils restent à intégrer dans un environnement Firebase de test distinct avant toute migration.
- L'assistant texte et voix nécessite encore un service sécurisé côté serveur, une gestion explicite des autorisations et une validation des actions sur les données. Il ne devra pas pouvoir modifier le code de l'application.
- La publication n'est considérée comme livrée qu'après un résultat de déploiement réussi et une adresse HTTPS retournée par l'hébergeur. Aucun lien prévisible ou supposé ne remplace cette vérification.
