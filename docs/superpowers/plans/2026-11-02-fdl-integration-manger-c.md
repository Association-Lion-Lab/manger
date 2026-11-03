# Intégration FDL, partie C : côté Manger!

Révision Codex du 3 novembre 2026, après validation explicite des quatre décisions par le porteur. Remplace le plan initial des commits `e75e22e` et `18ca8b2`, conservé dans Git. Branche `feat/fdl` depuis `development` `118e164`. Ne pas pousser sans accord.

## Contrats et périmètre

Source : `docs/CONTRATS.md` du dépôt FDL, sections projection, API `/api/v1` et OAuth 2.0 + PKCE ; clone FDL local `development` lu au commit `0e937d6`. Les conventions de Manger! et son AGENTS.md priment sur les anciennes instructions propres à Claude.

- PostgreSQL seulement ; `/api/fdl/*` en 404 sous SQLite ou sans configuration, interface masquée.
- Bêta : compte FDL requis. La suppression par l'auteur (`not_found`) garde les copies ; seul `removed` retire le contenu local.
- Une liaison par instance, administrée et partagée avec le foyer, recettes privées comprises ; information avant consentement.
- Une recette retirée encore planifiée conserve son identifiant et devient une fiche neutre, sans faux ingrédient dans les courses. Les références principales et les assiettes séparées sont couvertes.
- Sauvegarde du foyer sans jeton ni liaison, mais avec les métadonnées de suivi ; restauration déliée puis reprise après reconnexion. Configuration par origine `MANGER_FDL_URL`.

## Tâche 1 : stockage et sauvegarde

Migration additive `004-fdl`, trois tables, contraintes et droits dans le mécanisme existant ; migrations 001 à 003 inchangées. Réutilisation des écritures de recette sous le même client transactionnel et le verrou du foyer. Origine et identifiant FDL uniques ensemble, versions et changements locaux repérés. Import et suivi atomiques ; aucune fusion en cas de concurrence.

Format `manger-household` v2 avec suivi validé, sans jeton ; v1 et anciennes sources SQLite encore acceptées. Restauration transactionnelle, copie préalable et séquences conservées. Inventaire d'instance complet étendu à 25 tables, y compris le jeton dans l'archive administrative privée. Aucune extension du format de transfert SQLite à 22 tables.

Vérifier : rollback après insertion de recette, doublon concurrent, versions ignorées, retraits utilisés/inutilisés, restauration et absence de jeton dans le téléchargement du foyer, véritable archive/restauration des tables FDL, migration d'un schéma 003 avec données.

## Tâche 2 : liaison

Démarrage par POST administrateur avec contrôle d'origine, state/verifier aléatoires, PKCE S256. Cookie de flux séparé HttpOnly/Lax pour rattacher le navigateur sans affaiblir la session Strict. Retour public uniquement sur le runtime PostgreSQL activé. State borné, expirant et à usage unique avant échange ; session et droits recontrôlés avant enregistrement. Sérialisation liaison/déliaison, invalidation des demandes pendant restauration et arrêt.

Appels fixes serveur à serveur, délais et taille bornés, redirections refusées, messages traduits sans détails privés. Aucun jeton/verifier dans une réponse, page ou journal. Une déliaison locale ne révoque pas le jeton distant : rappel vers la sécurité FDL.

Vérifier : state inconnu/expiré/réutilisé/dupliqué, mauvais navigateur, administrateur révoqué, déliaison pendant demande, panne à l'échange et retour sans cookie de session général.

## Tâche 3 : recherche et import

Recherche paginée, filtres du contrat, réponse distincte de `mes-recettes`, import par identifiant ou lien de l'origine configurée. Projection explicite puis `validateRecipe`. Une unité vide devient pièce ; contenu encore invalide : 400 sans écriture. Auteur/licence/provenance/saisons conservés comme métadonnées source, sans nouveau tag de régime ou univers. Aucun téléchargement de photo. Révocation distante : liaison oubliée ; panne : 502 sans modification.

Vérifier : lien étranger, doublon, invalidité après conversion, recette supprimée/retirée, jeton révoqué, erreurs JSON ou redirection sans fuite de jeton.

## Tâche 4 : versions et modération

Vérification après une minute, puis toutes les vingt-quatre heures, et après liaison. Une seule exécution, arrêt borné et annulable. Lots de cent identifiants, collecte de tous les résultats avant transaction. Published/private avec version supérieure : proposition ; removed : retrait ; autres états et pannes : conserver. Comparaison de la liaison courante avant toute écriture. Mise à jour volontaire, avertissement des changements locaux, version ignorée conservée ; avis acquittables.

Vérifier : panne au deuxième lot sans effet du premier, réponse ancienne après changement de liaison, suppression de l'auteur conservée, références de repas et titres intacts, courses sans ingrédient artificiel.

## Tâche 5 : interface et intégrité de livraison

Sections repliables dans Compte et Recettes, aucun nouvel onglet. Actions administrateur seulement pour la liaison ; recherche/import pour les membres. Pagination limitée à l'écran, titre et source échappés, contrôles tactiles, messages et blocage du double appui. Auteur/licence/version visibles dans la fiche. Fonctions séparées dans `public/fdl-ui.js` et style local.

Vérifier : masque 404, rôle membre/admin, import/reprise/mise à jour, thèmes, petits écrans et texte agrandi dans navigateur isolé. Contrôle d'image des modules/pages/assets. Documentation du déploiement 004 distinct d'une mise à jour ordinaire : sauvegarde avec anciens outils, nouvelles images web/outils, migration explicite, santé et archive de 25 tables avant reprise du minuteur. Pas de commande Ubuntu exécutée par l'agent.

## Vérification finale et publication

Exécuter successivement `npm run test:postgres`, puis `npm test` avec faux FDL local ; aucun test ignoré, aucune donnée privée ni accès au serveur Ubuntu. Relecture des cas de sécurité et de concurrence, véritable construction et contrôle d'image. Fichiers modifiés en LF. Mettre à jour `docs/FDL.md`, architecture, guide, schéma, tests, confidentialité, décisions et feuille de route dans le même lot.

Statut du développement et résultats réels à lire dans `docs/FDL.md` et `docs/DECISIONS.md`. Les essais locaux ne prouvent pas le fonctionnement contre FDL déployé, ni Safari/iPhone/Android. Aucun push sans accord.
