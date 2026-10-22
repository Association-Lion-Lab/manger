# Migration PostgreSQL — tâches et points de contrôle

22 octobre 2026 — **plan validé ; tâches 01–02 réalisées, prochaine tâche 03 : schéma cible**. [Cadrage et risques](../docs/MIGRATION-POSTGRESQL.md), [ordre de réalisation](plan.md). Les noms des fichiers non encore créés restent des propositions. Chaque tâche comprend la mise à jour de la documentation concernée et de `docs/DECISIONS.md` ; les fichiers listés sont le périmètre technique principal. Si une tranche dépasse environ cinq fichiers techniques ou une session ciblée, la découper avant de coder, sans réduire ses critères.

## Phase 1 — Socle isolé

### 01 — Figer l'inventaire et les contrats

- [x] Réalisé le 22 octobre 2026.
- **Livrable :** matrice des 22 tables, routes/callers, types et effets observables ; compléter les cas de parité sans lire de données réelles.
- **Acceptation :** inventaire des appels synchrones et des fixtures complet ; cas limites dates/accents/JSON/photos/IDs notés ; base de référence SQLite verte et contrats de sauvegarde/sessions explicites.
- **Vérification :** `npm test`, `node image-check.js` et relecture de la matrice ; consigner le résultat réel, sans reprendre le nombre historique comme nouvelle preuve.
- **Dépendances :** validation du présent plan.
- **Fichiers probables :** `docs/MIGRATION-POSTGRESQL.md`, `docs/ARCHITECTURE.md`, nouveau `postgres-contract.test.js`.
- **Taille :** M.

Preuve : [matrice des 22 tables, consommateurs, routes et fixtures](../docs/POSTGRESQL-CONTRATS.md), cinq tests de caractérisation et mutation en mémoire détectée. Suite finale : **225 tests réussis, aucun ignoré**, HTTPS inclus ; `node image-check.js` réussi. Aucun changement applicatif, de schéma actif ou de dépendance. L'échec initial non reproduit est consigné, pas déclaré corrigé.

### 02 — Disposer d'un PostgreSQL de test privé

- [x] Réalisé le 22 octobre 2026 après autorisation de l'environnement local jetable.
- **Prérequis levé :** outils portables Windows PostgreSQL 18.6-5 depuis EDB, empreinte SHA-256 figée et vérifiée ; sans service système, PATH modifié ou serveur personnel. Docker reste indisponible localement : pas de Compose de test ajouté sans preuve d'exécution.
- **Livrable :** environnement reproductible, `pg` verrouillé et fixture isolée avec timeout/fermeture.
- **Acceptation :** version/empreinte des outils et rôle non-superutilisateur figés ; aucun secret réel/port réseau extérieur/volume existant ; absence de PostgreSQL requise signalée en échec, pas ignorée. Port loopback éphémère uniquement pour les tests natifs, pas de publication réseau ; digest de l'image future traité en 19.
- **Vérification :** installation npm verrouillée scripts désactivés, audit natif, connexion réelle avec paramètres, panne et arrêt propre de la fixture.
- **Dépendances :** 01 ; environnement Docker/PostgreSQL dédié fourni hors serveur de production.
- **02a — Outils et pilote :** `scripts/setup-postgres-test.ps1`, `.gitignore`, `package.json`, `package-lock.json`. Archive officielle contrôlée, extraction limitée, versions vérifiées ; `pg@8.23.1` en développement seulement, installation/audit npm et signatures vérifiés.
- **02b — Fixture et preuves :** `test-support/postgres.js`, `test-support/postgres.integration.cjs`, `postgres-fixture.test.js`, `.dockerignore`, `scripts/check-docker-context.js`. Test dédié, garde sans binaires et exclusions des helpers ; aucun changement métier.
- **Taille :** M.

Preuve : [installation et validations](../docs/POSTGRESQL-TEST.md), **7 tests PostgreSQL réussis**, aucune omission, paramètres/Unicode/NUL/rollback, privilèges refusés, timeouts, appartenance et coupure/reprise ; cluster retiré après les tests. Sans binaires : commande en échec attendu (code 1), pas de test ignoré. Archive factice altérée refusée avant extraction/exécution. Suite générale **227 réussites, aucune ignorée**, HTTPS inclus ; `node image-check.js` réussi. Aucun portage, Compose modifié, build Docker, transfert de données, essai Ubuntu/téléphone ou publication.

### 03 — Créer et versionner le schéma cible

- [ ] Réalisé.
- **Livrable :** schémas `household` et `auth`, rôles et migrations versionnées sans amorçage pendant une reprise.
- **Acceptation :** 22 tables et contraintes portées ; exécution/reprise/version incompatible contrôlées avec verrou de migration ; rôle applicatif incapable d'administrer le serveur ou les rôles.
- **Vérification :** cible vide, seconde exécution, échec intermédiaire et deux démarrages concurrents ; contraintes/rôles inspectés sur vrai PostgreSQL.
- **Dépendances :** 02.
- **Fichiers probables :** nouveaux `db/postgres.js`, `db/migrations/001-initial.js`, `postgres-schema.test.js`, script de bootstrap privé aux tests dans `test-support/`.
- **Taille :** M.

### 04 — Introduire la frontière asynchrone minimale

- [ ] Réalisé.
- **Livrable :** ouverture, choix explicite du moteur, client transactionnel et cycle de vie sans refonte métier générale.
- **Acceptation :** pas de connexion lors d'un simple import de module ; une transaction conserve son client ; échec PostgreSQL sans repli SQLite, arrêt avec requêtes en cours traité.
- **Vérification :** tests de transaction/rollback/timeout et lancement normal protégé ; SQLite continue à démarrer avec sa configuration actuelle.
- **Dépendances :** 03.
- **Fichiers probables :** `db/postgres.js`, `server.js`, nouvelle fixture `test-support/database.js`, `postgres-connection.test.js`.
- **Distribution :** promouvoir `pg` de développement vers production seulement lorsqu'il devient utilisé ; adapter les mentions de licences distribuées et vérifier l'image sans helpers/outils de tests.
- **Taille :** M.

**Point de contrôle A :** socle réel testé, version SQLite encore exploitable, frontières et format de sauvegarde proposés relus. Ne pas continuer avec des mocks PostgreSQL comme unique preuve.

## Phase 2 — Parcours métier complets

### 05 — Connexion et sessions

- [ ] Réalisé.
- **Livrable :** connexion/déconnexion et contrôle des requêtes sur `auth`.
- **Acceptation :** scrypt/cookies/origine/expirations inchangés ; accès et exports toujours refusés sans droit ; révocation pendant le hachage et compteurs de tentatives atomiques.
- **Vérification :** `node --test accounts.test.js` adapté à la fixture, cas PostgreSQL concurrents avec deux clients ; aucune donnée sensible dans erreurs/journaux.
- **Dépendances :** 04.
- **Fichiers probables :** `accounts.js`, nouveau `db/auth.js`, `accounts.test.js`, `postgres-auth.test.js`.
- **Taille :** M.

### 06 — Invitations et administration des accès

- [ ] Réalisé.
- **Livrable :** invitation, consommation unique, administration et commandes de récupération.
- **Acceptation :** une seule inscription concurrente gagne ; désactivation et changement de mot de passe révoquent comme avant ; aucun premier visiteur promu administrateur ni reset de mot de passe imposé par le portage.
- **Vérification :** suites accès et `invitation-mail.test.js`, conflit réel d'invitation et administration pendant hachage, commandes sur fixture dédiée.
- **Dépendances :** 05.
- **Fichiers probables :** `accounts.js`, `db/auth.js`, `accounts.test.js`, `postgres-auth.test.js`.
- **Taille :** M.

### 07 — Personnes et protéines

- [ ] Réalisé.
- **Livrable :** lecture/édition/retrait du foyer et protéines, préférences individuelles/globales préservées.
- **Acceptation :** régime/goûts/cru-cuit inchangés ; sans supplément conservé ; retrait de personne affectant les repas mais jamais le compte de connexion.
- **Vérification :** suites `preferences.test.js`, `dish-proteins.test.js`, profil UI et contrat HTTP sur la fixture PostgreSQL.
- **Dépendances :** 06.
- **Fichiers probables :** `server.js`, nouveau `db/household.js`, `preferences.test.js`, `dish-proteins.test.js`, `postgres-household.test.js`.
- **Taille :** M.

**Point de contrôle B :** accès et foyer testés sur les deux moteurs, sécurité/retrait conservés, aucun candidat incomplet proposé au déploiement.

### 08 — Création et édition d'une recette

- [ ] Réalisé.
- **Livrable :** recette avec ingrédients et étapes dans une transaction, lecture et suppression.
- **Acceptation :** IDs et ordre des étapes conservés ; rollback intégral en cas d'échec ; références repas et restrictions de suppression identiques.
- **Vérification :** cas CRUD de `server.test.js`, `preparation.test.js`, suppression et conflits sur PostgreSQL réel.
- **Dépendances :** 07.
- **Fichiers probables :** `server.js`, nouveau `db/recipes.js`, `server.test.js`, `preparation.test.js`, `postgres-recipes.test.js`.
- **Taille :** M.

### 09 — Photos, favoris, avis et imports

- [ ] Réalisé.
- **Livrable :** enrichissements et import/export de recettes sans changer le format d'échange existant.
- **Acceptation :** photos identiques et toujours prioritaires ; avis/favoris et import catalogue sans doublons ; garde-fous de l'import internet conservés.
- **Vérification :** cas existants `photos.test.js`, `favorites.test.js`, `recipe-notes.test.js`, catalogue et import sur PostgreSQL ; matrice suivie en 01, sans supprimer les tests hors fichiers de cette tranche.
- **Dépendances :** 08.
- **Fichiers probables :** `server.js`, `db/recipes.js`, `photos.test.js`, nouveau `postgres-recipe-extras.test.js`.
- **Taille :** M ; sous-tranches par capacité si le portage l'exige.

### 10 — Ajout et modification d'un repas

- [ ] Réalisé.
- **Livrable :** repas, personnes et assiettes séparées atomiques, calendrier ICS conservé.
- **Acceptation :** protéines facultatives et régimes respectés ; sorties/date/invités inchangés ; remplacement explicite distingué d'une création qui ne doit pas écraser un créneau.
- **Vérification :** `meal-changes.test.js`, `dish-proteins.test.js`, contrats planning/ICS et conflits d'écriture.
- **Dépendances :** 09.
- **Fichiers probables :** `server.js`, nouveau `db/meals.js`, `meal-changes.test.js`, `postgres-meals.test.js`.
- **Taille :** M.

**Point de contrôle C :** parcours recette → repas complet sur PostgreSQL, imports et photos inclus, aucun changement visuel requis.

### 11 — Semaines, déplacements et restes

- [ ] Réalisé.
- **Livrable :** menus composés, copie/semaine type et restes avec transactions cohérentes.
- **Acceptation :** aucune copie partielle ; un créneau concurrent est refusé sans écrasement ; liens de restes et snapshots de semaine préservés.
- **Vérification :** suites semaines/restes sur la fixture et concurrence de deux compositions sur des créneaux communs.
- **Dépendances :** 10.
- **Fichiers probables :** `server.js`, `db/meals.js`, `week-copy.test.js`, nouveau `postgres-weeks.test.js`.
- **Taille :** M ; séparer restes et semaines si nécessaire.

### 12 — Placard, suggestions et calcul des courses

- [ ] Réalisé.
- **Livrable :** lectures et écritures du stock, calculs et classement avec les données PostgreSQL.
- **Acceptation :** lots/dates/unités et précision inchangés ; classement goûts/anti-gaspi déterministe ; mois courant et filtres saisonniers non réécrits.
- **Vérification :** suites placard/menu/anti-gaspi et comparaison des sorties triées et quantités sur mêmes fixtures, tolérance numérique explicitée sans la relâcher pour masquer un écart.
- **Dépendances :** 11.
- **Fichiers probables :** `server.js`, nouveau `db/pantry.js`, `pantry.test.js`, nouveau `postgres-calculations.test.js`.
- **Taille :** M ; scinder stock et calculs si la tranche dépasse la limite.

### 13 — Courses éditables et synchronisation

- [ ] Réalisé.
- **Livrable :** courses calculées/manuelles, coches, rayons et synchronisation différée.
- **Acceptation :** conflit 409 préservé avec écriture conditionnelle ; modifications concurrentes sans écrasement silencieux ; pas de rejeu automatique d'une mutation incertaine.
- **Vérification :** `shopping-sync.test.js` et cas manuels de `server.test.js`, deux éditions concurrentes et échec réseau après engagement.
- **Dépendances :** 12.
- **Fichiers probables :** `server.js`, nouveau `db/shopping.js`, `shopping-sync.test.js`, nouveau `postgres-shopping.test.js`.
- **Taille :** M.

**Point de contrôle D :** parité métier complète, y compris bornes et refus ; ancienne suite entière conservée/adaptée et aucune route métier non portée.

## Phase 3 — Données et sauvegardes

### 14 — Analyser les sources SQLite sans les modifier

- [ ] Réalisé.
- **Livrable :** lecteur administratif et analyse des deux bases sur copie figée.
- **Acceptation :** schéma/version/intégrité/relation contrôlés ; source en lecture seule et normalisation ancienne version sur autre copie ; rapport sans nom de personne, mot de passe ou jeton.
- **Vérification :** fixtures version 4/anciennes prises en charge/inconnues/corrompues, fichiers manquants et empreintes de source identiques après refus.
- **Dépendances :** 13.
- **Fichiers probables :** nouveau `migration-source.js`, nouveau `migration-source.test.js`, `backup-tools.js` si réutilisation bornée pertinente.
- **Taille :** M.

### 15 — Importer et comparer intégralement

- [ ] Réalisé.
- **Livrable :** reprise administrative vers cible vide, analyse préalable et rapport de vérification privé minimal.
- **Acceptation :** import des 22 tables, IDs/relations/photos/hachages/expirations conservés ; refus de fusion/répétition ; séquences et marqueur de reprise validés sans cible partielle utilisable.
- **Vérification :** comparaison de toutes les valeurs normalisées et photos, interruption injectée, seconde tentative sur cible déjà migrée refusée et création d'un élément après migration.
- **Dépendances :** 14.
- **Fichiers probables :** nouveaux `migrate-postgres.js`, `migration-verify.js`, `migration.test.js`, `migration-source.js`.
- **Taille :** M.

### 16 — Télécharger une sauvegarde du foyer

- [ ] Réalisé.
- **Livrable :** format JSON de sauvegarde versionné, photographie cohérente des 18 tables du foyer, parcours de téléchargement conservé.
- **Acceptation :** photos incluses, accès exclus ; distinction avec export de recettes ; limites et erreurs explicites sans copie incohérente entre requêtes.
- **Vérification :** `backup.test.js`, `backup-ui.test.js` adaptés et téléchargement navigateur isolé ; vérifier ultérieurement sur Safari réel.
- **Dépendances :** 15 ; format détaillé approuvé.
- **Fichiers probables :** nouveau `household-backup.js`, `server.js`, `public/index.html`, `backup.test.js`, `backup-ui.test.js`.
- **Taille :** M.

### 17 — Restaurer le foyer avec récupération

- [ ] Réalisé.
- **Livrable :** aperçu puis remplacement transactionnel des données du foyer, compatibilité des anciennes sauvegardes SQLite.
- **Acceptation :** validation stricte/délai/taille et copie de récupération ; pas de SQL de fichier exécuté ; comptes inchangés et blocages des opérations concurrents, erreur après engagement distinguée d'un refus.
- **Vérification :** `restore.test.js`, `restore-ui.test.js`, ancien fichier SQLite et JSON, fichier hostile/version inconnue, collision et panne au milieu de restauration ; aucune opération partielle.
- **Dépendances :** 16 et 14.
- **Fichiers probables :** `restore.js`, `household-backup.js`, `public/index.html`, `restore.test.js`, `restore-ui.test.js`.
- **Taille :** M.

### 18 — Sauvegarder et récupérer l'instance complète

- [ ] Réalisé.
- **Livrable :** procédure administrateur PostgreSQL avec accès inclus, distincte du bouton du foyer.
- **Acceptation :** restauration vers une cible de secours et vérification de connexion avec compte existant ; rôles/secrets/TLS traités hors export client ; aucun dump privé versionné.
- **Vérification :** scénario `pg_dump`/restauration de confiance sur environnement isolé, comptes/foyer/photos vérifiés, erreur de version ou permissions traitée.
- **Dépendances :** 17.
- **Fichiers probables :** `backup-tools.js`, nouveau `postgres-backup.test.js`, `docs/GUIDE.md`, `docs/DOCKER.md`.
- **Taille :** M.

**Point de contrôle E :** transfert aller comparé, sauvegardes du foyer et instance restaurées ; impossibilité de revenir sans perte après nouvelles écritures explicitée et testée comme refus de procédure.

## Phase 4 — Livraison vérifiable

### 19 — Construire et tester l'image PostgreSQL

- [ ] Réalisé.
- **Livrable :** contrôle de build sans base et test réel après construction, Compose candidat volontaire avec volume distinct.
- **Acceptation :** pas de 5432 hôte/secret embarqué ; santé requêtant réellement les bons schémas et reprise de connexion ; données conservées après recréation des deux conteneurs.
- **Vérification :** build Docker, retrait expérimental d'un module/migration provoquant un échec, test isolé de volume et panne de base ; contrôles TLS inchangés.
- **Dépendances :** 18.
- **Fichiers probables :** `image-check.js`, `healthcheck.js`, nouveau `compose.postgres.yaml`, nouveau `scripts/test-postgres-image.sh`, `docker.test.js` ; ajustement Dockerfile/ignore à scinder si nécessaire.
- **Taille :** M à découper avant codage si le packaging exige d'autres fichiers.

### 20 — Bloquer les livraisons non testées dans la CI

- [ ] Réalisé.
- **Livrable :** matrice réelle SQLite/PostgreSQL, reprise/restauration et test d'image sur runner dédié.
- **Acceptation :** pas de succès avec PostgreSQL manquant ; contextes/secrets exclus toujours testés ; nettoyage seulement des ressources temporaires propres au job, sans accès production ni déploiement automatique.
- **Vérification :** config Compose, suite entière et échec volontaire d'une connexion pour prouver que le job est bloquant ; première exécution CI attestée séparément de sa préparation.
- **Dépendances :** 19 ; activation/fourniture du runner par son administrateur.
- **Fichiers probables :** `.forgejo/workflows/docker.yaml`, `scripts/test-postgres-image.sh`, `scripts/check-docker-context.js`, `docs/DOCKER.md`.
- **Taille :** M.

**Point de contrôle F :** vrais build et tests PostgreSQL/Linux réussis. Pas de livraison fondée uniquement sur le nombre historique de tests SQLite ou une relecture YAML.

## Phase 5 — Répétition et bascule volontaire

### 21 — Répéter la migration et les retours

- [ ] Réalisé.
- **Livrable :** répétition complète synthétique, puis procédure de répétition privée pour l'administrateur.
- **Acceptation :** durée et espace mesurés ; retour ancien volume avant réouverture prouvé ; après nouvelles écritures PostgreSQL, refus d'un faux retour sans perte et sauvegarde de l'état récent.
- **Vérification :** panne en analyse/import/démarrage, anciennes données utilisables et nouvelle cible intacte ; aucune base réelle transmise au dépôt, au runner ou à l'agent.
- **Dépendances :** 20.
- **Fichiers probables :** nouveau `migration-rehearsal.test.js`, `docs/MIGRATION-POSTGRESQL.md`, `docs/DOCKER.md`.
- **Taille :** M.

### 22 — Finaliser le guide administrateur

- [ ] Réalisé.
- **Livrable :** commandes exactes testées pour nouvelle installation, mise à jour, sauvegarde, reprise et diagnostic ; notes de version expliquant le changement.
- **Acceptation :** ancien volume/configuration conservés, choix moteur non implicite ; règle avant/après réouverture lisible ; stockage/confidentialité actualisés sans affirmer une conformité générale.
- **Vérification :** exécution du guide sur environnement Linux jetable depuis la révision livrable ; liens vérifiés et secrets absents des exemples.
- **Dépendances :** 21.
- **Fichiers probables :** `docs/GUIDE.md`, `docs/DOCKER.md`, `docs/ARCHITECTURE.md`, `docs/CONFIDENTIALITE.md`, `README.md`.
- **Taille :** M.

### 23 — Bascule par l'administrateur et recette sur appareil

- [ ] Réalisé.
- **Livrable :** compte rendu de bascule de l'instance, après publication autorisée séparément et créneau choisi par l'administrateur.
- **Acceptation :** sauvegarde complète contrôlée, interruption de toutes les écritures et reprise finale réussie ; mêmes comptes/données/origine ; recette Safari iPhone et décision explicite de réouverture.
- **Vérification :** l'utilisateur vérifie connexion, recettes/photos, repas, courses, téléchargement/restauration et icône ; l'administrateur confirme santé/persistance/retour disponible. Pas de validation inventée sur Android ou autres appareils.
- **Dépendances :** 22 ; accord d'exécution et accès serveur exclusivement géré par l'administrateur.
- **Fichiers probables :** `docs/ROADMAP.md` et `docs/DECISIONS.md` pour les résultats non sensibles seulement.
- **Taille :** S côté dépôt ; durée de maintenance issue des répétitions, non fixée ici.

**Point de contrôle final :** aucune validation humaine manquante présentée comme acquise ; anciennes sauvegardes et volume non supprimés ; support SQLite réexaminé dans une décision ultérieure, pas retiré à la fin de cette checklist sans autorisation.
