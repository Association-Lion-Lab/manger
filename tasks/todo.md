# Migration PostgreSQL — tâches et points de contrôle

25 octobre 2026 — **plan validé ; tâches 01–10 réalisées, prochaine tâche 11 : semaines, déplacements et restes**. [Cadrage et risques](../docs/MIGRATION-POSTGRESQL.md), [ordre de réalisation](plan.md). Les noms des fichiers non encore créés restent des propositions. Chaque tâche comprend la mise à jour de la documentation concernée et de `docs/DECISIONS.md` ; les fichiers listés sont le périmètre technique principal. Si une tranche dépasse environ cinq fichiers techniques ou une session ciblée, la découper avant de coder, sans réduire ses critères.

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

- [x] Réalisé le 22 octobre 2026, sur les seuls clusters de test jetables.
- **Livrable :** schémas `household` et `auth`, rôles et migrations versionnées sans amorçage pendant une reprise.
- **Acceptation :** 22 tables et contraintes portées ; exécution/reprise/version incompatible contrôlées avec verrou de migration ; rôle applicatif incapable d'administrer le serveur ou les rôles.
- **Vérification :** cible vide, seconde exécution, échec intermédiaire et deux démarrages concurrents ; contraintes/rôles inspectés sur vrai PostgreSQL.
- **Dépendances :** 02.
- **Fichiers probables :** nouveaux `db/postgres.js`, `db/migrations/001-initial.js`, `postgres-schema.test.js`, script de bootstrap privé aux tests dans `test-support/`.
- **Découpage de réalisation :** 03a, séparer propriétaire/migration et application dans la fixture, avec refus DDL et tests existants conservés ; 03b, DDL des 22 tables, exécuteur versionné, tests locaux sans connexion et intégration réelle (cinq fichiers techniques principaux). Aucun appel au démarrage de Manger! avant les tâches suivantes.
- **03a réalisée (`d2148e0`) :** deux rôles non-superutilisateurs distincts, aucun DDL/objet temporaire/prise de rôle pour l'application ; huit tests PostgreSQL verts, aucun ignoré, données et nettoyage des deux pools vérifiés.
- **03b — Schéma réalisé (`7cd12c1`) :** quatre fichiers techniques, DDL/exécuteur et deux suites de tests ; dix tests PostgreSQL réels et 229 généraux verts, aucun ignoré, HTTPS inclus. [Contrat et limites](../docs/POSTGRESQL-SCHEMA.md), notamment rôles frais et restauration/recalage opérateur à traiter en 15–17/19.
- **Commande agrégée réalisée :** deux fichiers supplémentaires, `package.json` et sa garde ; rouge avant modification puis **18 tests PostgreSQL réussis**, aucun ignoré. Suite finale **229/229**, HTTPS inclus ; `node image-check.js` réussi. Aucun module métier, dépendance, Compose, donnée privée ou serveur touché ; pas de publication. La version PostgreSQL de l'application n'est pas encore utilisable.
- **Taille :** M.

### 04 — Introduire la frontière asynchrone minimale

- [x] Réalisé le 22 octobre 2026, socle isolé sans bascule métier.
- **Livrable :** ouverture, choix explicite du moteur, client transactionnel et cycle de vie sans refonte métier générale.
- **Acceptation :** pas de connexion lors d'un simple import de module ; une transaction conserve son client ; échec PostgreSQL sans repli SQLite, arrêt avec requêtes en cours traité.
- **Vérification :** tests de transaction/rollback/timeout et lancement normal protégé ; SQLite continue à démarrer avec sa configuration actuelle.
- **Dépendances :** 03.
- **Fichiers probables :** `db/postgres.js`, `server.js`, nouvelle fixture `test-support/database.js`, `postgres-connection.test.js`.
- **Distribution :** promouvoir `pg` de développement vers production seulement lorsqu'il devient utilisé ; adapter les mentions de licences distribuées et vérifier l'image sans helpers/outils de tests.
- **Découpage avant réalisation :** 04a, module PostgreSQL, gardes sans serveur et fixture/intégration réelle (quatre fichiers principaux) ; 04b, sélection explicite et refus du candidat incomplet au lancement normal ; 04c, dépendance de production/licences puis agrégation des tests et clôture. Aucun parcours métier réécrit dans ce lot.
- **04a réalisée :** frontière sans connexion à l'import, pool et client réservés, rollback, erreurs privées et arrêt avec acquisitions tardives ; onze tests sans serveur et dix tests PostgreSQL réels verts, aucun ignoré. [Contrat et limites](../docs/POSTGRESQL-CONNEXION.md). Sélection/distribution encore à réaliser, tâche 04 non clôturée.
- **04b réalisée :** sélection pure et refus explicite du candidat PostgreSQL incomplet avant ouverture des fichiers/écoute ; défaut/choix SQLite toujours protégé par les comptes. Trois tests de lancement normal verts ; régression de remise du client ajoutée, frontière à douze tests sans serveur plus dix réels. Agrégation/distribution finale en attente.
- **04c réalisée :** pilote promu en production sans changer de version, licences complètes distribuées et vérifiées ; résumé sobre Connexion/Compte. Commande PostgreSQL agrégée à trois suites, contrôle des modules `db/` et notices au build sans connexion. Réinstallation de production réussie, audit/signatures vérifiés ; **249 tests généraux et 28 PostgreSQL réussis**, aucun ignoré, HTTPS inclus, mutation de COMMIT détectée, `node image-check.js` réussi. Commande sans binaires en échec attendu. Pas de build Docker local, déploiement, donnée privée ou publication ; prochaines preuves Docker/CI prévues en 19–20.
- **Taille :** M.

**Point de contrôle A atteint pour le socle :** PostgreSQL réel testé, lancement SQLite sécurisé toujours exploitable, frontière et proposition de sauvegarde relues. Aucune sauvegarde/restauration PostgreSQL encore implémentée ni candidat de déploiement prêt ; preuves spécifiques en 14–20. Ne pas continuer avec des mocks PostgreSQL comme unique preuve.

## Phase 2 — Parcours métier complets

### 05 — Connexion et sessions

- [x] Réalisé le 22 octobre 2026, candidat PostgreSQL isolé et SQLite conservé au lancement normal.
- **Livrable :** connexion/déconnexion et contrôle des requêtes sur `auth`.
- **Acceptation :** scrypt/cookies/origine/expirations inchangés ; accès et exports toujours refusés sans droit ; révocation pendant le hachage et compteurs de tentatives atomiques.
- **Vérification :** `node --test accounts.test.js` adapté à la fixture, cas PostgreSQL concurrents avec deux clients ; aucune donnée sensible dans erreurs/journaux.
- **Dépendances :** 04.
- **Fichiers probables :** `accounts.js`, nouveau `db/auth.js`, `accounts.test.js`, `postgres-auth.test.js`.
- **Découpage avant réalisation :** 05a, dépôt PostgreSQL des six opérations connexion/sessions et tests réels ; 05b, petit dépôt SQLite et middleware commun explicitement attendable, sans porter les invitations/administration de 06 ; 05c, tests HTTP communs, concurrence/révocation/erreurs, agrégation et clôture documentaire. Le lancement normal PostgreSQL reste refusé ; aucune donnée réelle ou instance Ubuntu utilisée.
- **Preuves 05a–05c :** [contrat et limites](../docs/POSTGRESQL-AUTH.md). Même contrat HTTP sur les deux moteurs, vrais hachages scrypt, sessions et cookies inchangés, compteurs atomiques entre pools ; révocation/désactivation pendant le hachage et expiration pendant l'attente de verrou vérifiées. Relecture : purge bornée sans attente des sessions verrouillées et revalidation de la déconnexion ajoutées après régressions rouges ; mutation en mémoire du contrôle de déconnexion détectée. **264 tests généraux et 53 PostgreSQL réels réussis, aucun ignoré**, HTTPS inclus ; `node image-check.js` réussi et audit de production sans vulnérabilité signalée. Aucune donnée réelle transférée, configuration Compose modifiée, publication ou validation Docker/Linux/Ubuntu/appareil ; invitations, administration et récupération restent en 06.
- **Taille :** M.

### 06 — Invitations et administration des accès

- [x] Réalisé le 22 octobre 2026, candidat isolé ; aucun déploiement PostgreSQL activé.
- **Livrable :** invitation, consommation unique, administration et commandes de récupération.
- **Acceptation :** une seule inscription concurrente gagne ; désactivation et changement de mot de passe révoquent comme avant ; aucun premier visiteur promu administrateur ni reset de mot de passe imposé par le portage.
- **Vérification :** suites accès et `invitation-mail.test.js`, conflit réel d'invitation et administration pendant hachage, commandes sur fixture dédiée.
- **Dépendances :** 05.
- **Fichiers probables :** `accounts.js`, `db/auth.js`, `accounts.test.js`, `postgres-auth.test.js`.
- **Découpage avant réalisation :** 06a, invitations/administration et réservation SMTP dans les dépôts, avec transactions et tests PostgreSQL réels ; 06b, middleware commun et contrats HTTP/SMTP, courses pendant scrypt ; 06c, commandes locales injectables, tests de récupération et clôture. Aucun parcours foyer, schéma, interface ou lancement normal PostgreSQL ajouté. [Contrat de travail](../docs/POSTGRESQL-ACCES.md).
- **Preuves 06a–06c :** consommation unique entre deux pools, doublon conservant le lien, expiration/révocation après attente, rollback de désactivation/récupération, compteurs SMTP partagés et même contrat HTTP/commandes sur les deux moteurs. **282 tests généraux et 81 PostgreSQL réussis**, aucun ignoré, HTTPS inclus ; modules vérifiés, audit de production sans vulnérabilité signalée, mutation en mémoire détectée. Pas de publication ou donnée réelle ; lancement standard toujours SQLite. Service de commande interne PostgreSQL testé par injection ; raccordement de sa configuration CLI au lancement complet en 19, pas une commande de déploiement disponible aujourd'hui.
- **Taille :** M.

### 07 — Personnes et protéines

- [x] Réalisé.
- **Livrable :** lecture/édition/retrait du foyer et protéines, préférences individuelles/globales préservées.
- **Acceptation :** régime/goûts/cru-cuit inchangés ; sans supplément conservé ; retrait de personne affectant les repas mais jamais le compte de connexion.
- **Vérification :** suites `preferences.test.js`, `dish-proteins.test.js`, profil UI et contrat HTTP sur la fixture PostgreSQL.
- **Dépendances :** 06.
- **Fichiers réalisés :** `server.js`, `household.js`, `household-http.js`, `db/household.js`, `db/household-sqlite.js`, contrats partagés dans `test-support/` ; anciens tests de préférences/assiettes/formulaires conservés.
- **Découpage avant réalisation :** 07a, dépôt PostgreSQL et parité de lecture/mutations avec tests réels ; 07b, dépôt SQLite, validateurs purs et routes communes, maintien des exports synchrones utilisés par les calculs ; 07c, contrat HTTP protégé, concurrence/rollback, profil et vérification complète. [Contrat et limites](../docs/POSTGRESQL-FOYER.md). Pas de recettes/planning PostgreSQL portés dans cette étape, ni activation normale du candidat.
- **Clôture le 25 octobre :** 294 tests généraux et 97 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; création/édition/réouverture du profil contrôlées dans Chromium avec SQLite en mémoire. Contrat HTTP commun, IDs zéro/grands, rollback et attentes de verrous vérifiés ; tâche 08 non commencée. Alerte npm Nodemailer préexistante à traiter avant publication, [triage](../docs/DECISIONS.md).
- **Taille :** M.

**Point de contrôle B :** accès et foyer testés sur les deux moteurs, sécurité/retrait conservés, aucun candidat incomplet proposé au déploiement.

### 08 — Création et édition d'une recette

- [x] Réalisé le 25 octobre 2026, dépôt candidat et routes communes testés, SQLite conservé au lancement normal.
- **Livrable :** recette avec ingrédients et étapes dans une transaction, lecture et suppression.
- **Acceptation :** IDs recette/ingrédients partagés et ordre des étapes conservés ; positions renumérotées 1..N à la validation et IDs techniques d'étape recréés comme avant ; rollback intégral en cas d'échec ; références repas et restrictions de suppression identiques.
- **Vérification :** cas CRUD de `server.test.js`, `preparation.test.js`, suppression et conflits sur PostgreSQL réel.
- **Dépendances :** 07.
- **Fichiers réalisés :** `server.js`, `recipe.js`, `recipe-http.js`, `db/recipes.js`, `db/recipes-sqlite.js`, règles/contrat HTTP et deux suites réelles dans `test-support/` ; anciennes suites conservées.
- **Découpage avant réalisation :** 08a, dépôt réel et transactions ; 08b, validation/dépôt SQLite/routes communes ; 08c, contrats HTTP protégés, concurrence/rollback et clôture. [Contrat et limites](../docs/POSTGRESQL-RECETTES.md). Les opérations photo déjà incluses dans POST/PUT restent atomiques, sans prétendre clore les enrichissements/imports de 09.
- **Clôture :** 306 tests généraux et 115 PostgreSQL réels verts, aucun ignoré, HTTPS inclus ; contrôle modules/notices réussi, audit npm sans alerte après correctif Nodemailer 10.2.1. Huit tâches closes et quinze restantes ; aucune donnée réelle, publication ou bascule, aucun nouveau navigateur/appareil validé.
- **Taille :** M.

### 09 — Photos, favoris, avis et imports

- [x] Réalisé le 25 octobre 2026, routes communes et dépôts isolés ; aucune bascule activée.
- **Livrable :** enrichissements et import/export de recettes sans changer le format d'échange existant.
- **Acceptation :** photos identiques et toujours prioritaires ; avis/favoris et import catalogue sans doublons ; garde-fous de l'import internet conservés.
- **Vérification :** cas existants `photos.test.js`, `favorites.test.js`, `recipe-notes.test.js`, catalogue et import sur PostgreSQL ; matrice suivie en 01, sans supprimer les tests hors fichiers de cette tranche.
- **Dépendances :** 08.
- **Fichiers réalisés :** dépôts `db/recipes.js` et `db/recipes-sqlite.js`, `recipe.js`, `recipe-http.js`, `recipe-extras-http.js`, `recipe-preview.js`, erreurs prévues de `recipe-import.js` et raccordement `server.js` ; contrats communs et deux suites réelles dans `test-support/`, tests SQLite/règles/aperçus et garde du lanceur standard. Anciennes suites conservées.
- **Découpage avant code :** 09a photos/favoris/avis dans les dépôts ; 09b catalogue transactionnel et export ; 09c aperçu réseau/fichier et routes communes ; 09d contrats HTTP, concurrence/rollback et clôture. [Contrat et limites](../docs/POSTGRESQL-ENRICHISSEMENTS.md). Pas de moteur partiel déployé ou de parcours repas commencé.
- **Clôture :** 329 tests généraux et 136 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; photos/avis/favoris, catalogue réel et imports concurrents avec rollback, export/aperçu sans écriture, auth/origine/erreurs privées et garde URL vérifiés. Trois cycles de relecture séparée, module/image et audit npm sans alerte ; incidents intermittents de harnais consignés, cause inconnue, passage complet final vert. Neuf tâches closes et quatorze restantes ; pas de nouvelle validation appareil/internet réel/Docker/Linux/Ubuntu, donnée privée, publication ou étape 10 commencée.
- **Taille :** M ; sous-tranches par capacité si le portage l'exige.

### 10 — Ajout et modification d'un repas

- [x] Réalisé le 25 octobre 2026, candidat isolé et SQLite normal conservé.
- **Livrable :** repas, personnes et assiettes séparées atomiques, calendrier ICS conservé.
- **Acceptation :** protéines facultatives et régimes respectés ; sorties/date/invités inchangés ; remplacement explicite distingué d'une création qui ne doit pas écraser un créneau.
- **Vérification :** `meal-changes.test.js`, `dish-proteins.test.js`, contrats planning/ICS et conflits d'écriture.
- **Dépendances :** 09.
- **Fichiers réalisés :** `dates.js`, `meal.js`, `meal-http.js`, dépôts `db/meals.js`/`db/meals-sqlite.js`, wrappers et routes `server.js`, envoi `postMeal` dans l'interface ; contrats partagés dans `test-support/`, deux suites réelles et tests règles/SQLite/VM. Lanceur et garde de liste actualisés, anciennes suites conservées.
- **Découpage avant code :** 10a règles/dépôts et lecture cohérente ; 10b routes protégées et ICS, précondition additive de créneau ; 10c concurrence/rollback et garde client ; 10d agrégation, vérification complète et clôture. [Contrat et limites](../docs/POSTGRESQL-REPAS.md). Restes/déplacements/semaines restent en 11, leurs références existantes protégées ici.
- **Clôture :** 347 tests généraux et 155 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; mêmes contrats HTTP, vrais verrous et rollback après enfants/retrait, DTO/ICS et préconditions de valeur d'ID. Limites anciens clients et IDs SQLite réutilisés documentées, trois cycles de relecture réconciliés ; contrôle modules/image et audit npm sans alerte, sans binaires refus explicite. Dix tâches closes, treize restantes ; aucun déploiement, base réelle, publication ou étape 11 commencée.
- **Taille :** M.

**Point de contrôle C atteint pour les parcours portés :** recette enregistrée → repas et assiettes testés sur PostgreSQL, imports/photos couverts par les contrats de 09, ICS conservé. Aucun portage complet du planning ou déploiement annoncé ; semaines/restes restent en 11, calculs en 12–13.

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
- **Autorité de séquence :** recalage par l'opérateur sur cible neuve ; `setval` n'est pas annulé par rollback. Panne après recalage = nouvelle cible vierge, pas réutilisation/fusion silencieuse.
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
- **Décision à clore avant livraison :** voie administrative contrôlée pour le recalage des seules séquences du foyer, sans distribuer le mot de passe propriétaire au client ni accorder UPDATE général des séquences au rôle applicatif. Conserver et tester le parcours guidé existant ; pas de suppression du bouton comme contournement.
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
- **Raccordement des commandes :** utiliser le service `accountCommand` déjà testé en 06 avec un dépôt PostgreSQL ouvert explicitement par la configuration de déploiement, sans repli SQLite ; vérifier les vrais sous-processus CLI sur instance jetable. La garde actuelle refuse volontairement le moteur incomplet avant fichier.
- **Acceptation :** pas de 5432 hôte/secret embarqué ; santé requêtant réellement les bons schémas et reprise de connexion ; données conservées après recréation des deux conteneurs.
- **Bootstrap de confiance :** rôles dédiés neufs, sans ACL globales de paramètres/fonctions administratives ni appartenances imprévues ; ne pas recycler un ancien rôle au seul motif que ses flags sont non-superutilisateur. Préflight actuel non assimilé à un audit exhaustif d'un cluster tiers.
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
