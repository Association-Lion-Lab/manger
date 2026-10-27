# PostgreSQL local et jetable pour les tests

La tâche 02 du [plan de migration](MIGRATION-POSTGRESQL.md) est réalisée sur Windows le **22 octobre 2026**. Ce dispositif prépare le développement : **Manger! utilise toujours SQLite**. Il ne convertit aucune base, ne démarre aucun service Windows et n'accède pas au serveur Ubuntu.

## Préparer les outils

Depuis la racine du dépôt, avec Node.js 24+ et PowerShell 7 :

```powershell
npm ci --ignore-scripts
pwsh -NoProfile -File ./scripts/setup-postgres-test.ps1
npm run test:postgres
```

Le script télécharge environ **367 Mio** une seule fois dans `.test-tools/`, ignoré par Git et exclu de l'image Docker. Il vérifie l'empreinte avant extraction/exécution et ne décompresse que `pgsql/bin`, `pgsql/lib` et `pgsql/share`. Ni installation système, ni modification du PATH, du pare-feu ou d'un service. Les outils restent disponibles après les tests ; aucune base n'est conservée avec eux.

| Élément figé | Valeur |
| --- | --- |
| Serveur et outils | PostgreSQL **18.6**, distribution EDB Windows x64 **18.6-5** |
| Archive | [postgresql-18.6-5-windows-x64-binaries.zip](https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64-binaries.zip) |
| SHA-256 | `e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2` |
| Référence d'intégrité | [Empreinte publiée par EDB](https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64-binaries.zip.sha256), consultée le 22 octobre 2026 |
| Pilote verrouillé | `pg` **8.23.1**, initialement de développement, promu en production à la tâche 04 avec ses mêmes transitives |

[PostgreSQL pour Windows](https://www.postgresql.org/download/windows/) renvoie vers les [archives EDB](https://www.enterprisedb.com/download-postgresql-binaries). L'empreinte est obtenue via HTTPS auprès du même éditeur : ce contrôle détecte une archive différente, mais n'est pas une signature indépendante des binaires. Une empreinte incorrecte bloque sans exécuter ni supprimer l'archive. Une extraction partielle ou une version inattendue bloque également, sans réparation destructive automatique.

Si une politique Windows interdit les scripts, ne pas modifier la politique globale : demander l'autorisation d'exécuter ce script connu dans un processus dédié. Le test de refus d'archive a nécessité un processus PowerShell 7 avec une autorisation limitée à ce processus ; aucun paramètre système n'a été modifié.

## Exécuter et isoler

`npm run test:postgres` lance dix-sept fichiers de suites réelles : fixture (`test-support/postgres.integration.cjs`), schéma (`test-support/postgres-schema.integration.cjs`), frontière asynchrone (`test-support/postgres-connection.integration.cjs`), connexion/sessions (`test-support/postgres-auth.integration.cjs`), dépôt d'accès (`test-support/postgres-access.integration.cjs`), HTTP/SMTP (`test-support/postgres-access-http.integration.cjs`), récupération (`test-support/postgres-account-command.integration.cjs`), dépôt foyer (`test-support/postgres-household.integration.cjs`), HTTP foyer (`test-support/postgres-household-http.integration.cjs`), dépôt recettes (`test-support/postgres-recipes.integration.cjs`), HTTP recettes (`test-support/postgres-recipes-http.integration.cjs`), enrichissements/catalogue (`test-support/postgres-recipe-extras.integration.cjs`), HTTP enrichissements/aperçu (`test-support/postgres-recipe-extras-http.integration.cjs`), dépôt repas (`test-support/postgres-meals.integration.cjs`), HTTP repas/ICS (`test-support/postgres-meals-http.integration.cjs`), dépôt semaines/restes (`test-support/postgres-planning.integration.cjs`) et HTTP planning (`test-support/postgres-planning-http.integration.cjs`). `npm test` conserve la suite générale et les gardes sans serveur ; il ne remplace pas le passage PostgreSQL. Si les binaires nécessaires sont absents ou leur version différente, la commande PostgreSQL **échoue**, sans test ignoré ni connexion à une instance existante.

Les commandes limitent les **fichiers de tests** exécutés simultanément : deux pour `npm test`, un pour `npm run test:postgres` ; les scénarios de concurrence internes continuent de lancer leurs vraies opérations concurrentes. Exécuter les deux commandes successivement sur cette machine. Le lancement conjoint avec douze fichiers de tests généraux en parallèle a dépassé les délais `initdb`/contrôle modules ; même seule, la suite générale non bornée a dépassé le délai d'un sous-processus. Le contrôle de modules isolé repasse 13/13 sans augmenter son délai de 15 s ; la suite générale bornée repasse 294/294. Deux fichiers PostgreSQL à la fois ont encore dépassé deux préparations `initdb` à 30 s (81 tests passés, deux parents en échec avant leurs scénarios) : exécution séquentielle des fichiers retenue. La limite de concurrence ne retire ni test, ni assertion, ni requête lente ; budgets applicatifs et timeouts des contrôles conservés.

La fixture crée un répertoire temporaire neuf `manger-pg-test-*`, un marqueur aléatoire d'appartenance et un cluster avec authentification **SCRAM-SHA-256**. Le serveur écoute uniquement sur **127.0.0.1**, avec un port libre éphémère, sans socket Unix. Aucun port 5432 fixe ou accès réseau extérieur. La réservation du port est relâchée avant le démarrage ; si une autre application le prend entre-temps, le démarrage échoue, sans utiliser cette autre instance.

Les rôles de bootstrap, de migration et d'application ont des mots de passe aléatoires par exécution. Depuis la tranche 03a, seul `manger_test_migrator` est propriétaire de la base ; migration et application sont sans superutilisateur, création de bases/rôles, réplication ou contournement RLS. L'application n'est membre d'aucun rôle de migration, ne peut créer ni schéma/table ni objet temporaire ; le schéma `public` est fermé à la création publique. Les tables de sonde sont créées par le pool de migration et accordées explicitement à l'application. Ce sont des rôles de test, pas un provisionnement de production. Les variables natives `PG*` sont retirées de l'environnement des sous-processus ; le pilote reçoit explicitement les coordonnées et identifiants de la fixture. Aucun secret réel, `.env`, `DATABASE_URL`, volume ou base SQLite n'est utilisé.

La connexion locale synthétique utilise `ssl: false` uniquement pour ce loopback jetable ; **ne pas reprendre ce choix pour une base distante**. Délai de connexion de 2 secondes, requête côté client de 3 secondes et `statement_timeout` serveur de 1 seconde. Pool de quatre connexions maximum, gestion des erreurs de connexions inactives et fermeture explicite. L'administrateur temporaire est fermé après création du rôle ; le fichier de mot de passe de bootstrap est retiré après `initdb`.

Exception de préparation mesurée le 25 octobre : le clonage physique `CREATE DATABASE … TEMPLATE template0` a dépassé le plafond SQL d'une seconde lors de deux essais, avant tout test métier. Une sonde isolée en mémoire mesure 1 256 ms et confirme que les pools conservent `statement_timeout=1s`. Cette seule commande de bootstrap dispose désormais de 15 s côté serveur / 20 s côté client, puis le plafond est remis à 1 s ; aucun délai runtime, test de requête lente ou assertion métier assoupli. Pas de retry automatique ni désactivation de fsync ; cleanup de la fixture conservé. [Fonctionnement du clonage PostgreSQL](https://www.postgresql.org/docs/18/sql-createdatabase.html).

Validation ciblée du correctif : 14 tests réussis sur PostgreSQL réel (dépôt foyer en cours et fixture), aucun ignoré ; annulation de la requête lente, reprise du pool, arrêt/reprise et nettoyage conservés. Les deux pools sont explicitement contrôlés à `1s` après la préparation.

Les fichiers de test héritent des protections du répertoire temporaire de l'utilisateur ; le mode `0600` demandé n'est pas une preuve d'ACL Windows. Employer un compte et un répertoire de travail locaux de confiance, pas un dossier partagé.

## Arrêt et nettoyage

À la fin, même en cas d'assertion en échec, le hook ferme le pool, arrête **son propre cluster** et supprime **son propre répertoire temporaire**. Avant toute commande de contrôle ou suppression, il vérifie emplacement, marqueur et absence de détournement du répertoire ; un marqueur altéré provoque un refus plutôt qu'une opération sur une ressource inconnue. Les délais sont bornés et un nettoyage impossible fait échouer le test.

Une coupure brutale de Windows ou du processus de test ne permet pas de garantir l'exécution du hook. Un éventuel dossier résiduel n'est pas supprimé automatiquement au prochain lancement : identifier d'abord son propriétaire et l'éventuel processus correspondant. Ne jamais lancer une purge globale de PostgreSQL ou du dossier temporaire.

Pour réutiliser des binaires locaux de confiance dans un autre emplacement, `MANGER_TEST_PG_BIN` peut indiquer leur dossier `bin` ; la version 18.6 reste exigée. Ce réglage désigne des **exécutables**, jamais une URL de base existante. Le comportement sous Linux et le futur environnement Docker/CI restent à tester, pas réputés validés par ce passage Windows.

## Preuves du 22 octobre 2026

1. Archive officielle vérifiée ; `postgres`, `initdb`, `pg_ctl`, `psql`, `pg_dump` annoncent tous 18.6. Archive factice incorrecte refusée avant extraction/exécution dans un dossier temporaire indépendant, ensuite retiré.
2. **7 tests PostgreSQL réussis, aucun ignoré** : serveur réel et droits refusés, paramètres/Unicode/octet NUL, rollback sur client réservé, délai de requête, connexion sans réponse, refus de contrôle sans marqueur, coupure/reprise et données conservées pendant cette reprise. Dossier du cluster absent après fermeture ; fermeture répétée sans effet.
3. Commande dédiée exécutée avec un chemin de binaires inexistant : échec attendu, code 1, aucun test ignoré. Suite générale : **227 réussites, aucune ignorée**, HTTPS inclus ; contrôle `node image-check.js` réussi sans base persistante.
4. `npm ci --ignore-scripts` avec le verrou actuel, `npm audit --audit-level=high` : aucune vulnérabilité signalée ; `npm audit signatures` : 15 signatures de registre vérifiées et une attestation. Ce résultat daté ne vaut pas garantie permanente d'absence de vulnérabilité.

`pg` reste en **devDependency** : l'image de production l'omet avec `npm ci --omit=dev`, ainsi que les outils/helpers de tests. Aucun module métier, fichier Compose, base ou volume utilisateur modifié. Contrôles d'exclusion Docker renforcés, mais **pas de build ou d'essai Docker/Linux local**, faute de Docker ; aucune validation sur Ubuntu ou téléphone. Lors du portage applicatif, promouvoir explicitement le pilote en dépendance de production et actualiser les licences distribuées.

Références de mise en œuvre : [initdb](https://www.postgresql.org/docs/18/app-initdb.html), [pg_ctl](https://www.postgresql.org/docs/18/app-pg-ctl.html), [connexion du pilote](https://node-postgres.com/features/connecting), [pool et cycle de vie](https://node-postgres.com/apis/pool). Étape suivante : tâche 03, schéma versionné sur cette fixture, sans import de données réelles.

Tranche **03a** du même jour : test rouge constatant l'absence de pool de migration, puis **8 tests PostgreSQL réussis, aucun ignoré**, après séparation des rôles. Création dans `public`, création d'objet dans la base, droit temporaire et `SET ROLE` vers le propriétaire refusés à l'application ; sondes de données, rollback, délais et coupure/reprise conservés. Les deux pools sont fermés par le nettoyage existant. Le schéma métier cible restait à créer à ce point de contrôle.

**État après tâche 03 :** [schéma cible versionné](POSTGRESQL-SCHEMA.md) créé et réellement testé sans amorçage ni appel par l'application. La commande PostgreSQL commune passe **18 tests**, la suite générale **229**, aucune omission et HTTPS inclus. L'« étape suivante 03 » du compte rendu 02 ci-dessus est historique ; prochaine étape actuelle : 04. Pas de pilote promu en production, transfert de données, publication ou accès Ubuntu.

**État après tâche 04 :** les mentions devDependency et étapes suivantes ci-dessus décrivent leurs lots historiques. `pg` est désormais en production, version inchangée, avec notices distribuées. La commande dédiée agrégeait fixture, schéma et [frontière asynchrone](POSTGRESQL-CONNEXION.md) : **28 tests réels réussis**, aucune omission ; **249 tests généraux réussis**, HTTPS inclus. Les helpers/outils restent exclus de l'image. Le produit reste SQLite ; PostgreSQL incomplet refusé avant ouverture des bases, pas de déploiement ou transfert.

**État après tâche 05 :** quatre suites agrégées, dont [connexion/sessions](POSTGRESQL-AUTH.md) : **53 tests PostgreSQL réels et 264 tests généraux réussis**, aucun ignoré, HTTPS inclus. Contrats HTTP communs, vrais hachages scrypt existants, blocages/révocations pendant hachage et verrou, compteurs partagés et panne/reprise testés sur clusters synthétiques. Aucun transfert de comptes réels, changement de dépendance, Compose ou volume ; lancement normal encore SQLite, candidat PostgreSQL incomplet refusé. Prochaine étape à ce point historique : 06.

**État après tâche 06 :** sept suites, **81 tests PostgreSQL réels et 282 tests généraux réussis**, aucun ignoré, HTTPS inclus. [Invitations/administration, SMTP et service de récupération](POSTGRESQL-ACCES.md) testés avec mêmes contrats, attentes de verrou réelles et rollback. Commande sans binaires en échec attendu (code 1, neuf tests de tête échouent, aucun ignoré). Mutations de test en mémoire seulement ; commandes shell SQLite sur répertoire synthétique, service de commande PostgreSQL injecté sur fixture privée. Lancement et commandes standard PostgreSQL encore refusés avant ouverture SQLite, pas de données réelles, publication ou validation Docker/Linux/CI PostgreSQL/Ubuntu/appareil. Prochaine tâche à ce point historique : 07, personnes/protéines.

**État après tâche 09 :** treize fichiers, **136 tests PostgreSQL réels et 329 tests généraux réussis**, aucun ignoré, HTTPS inclus. [Recettes](POSTGRESQL-RECETTES.md) puis [enrichissements/imports](POSTGRESQL-ENRICHISSEMENTS.md) portés sans bascule ; prochaine tâche à ce point historique 10, repas. Sans binaires, quinze parents refusés avant préparation (code 1), aucun ignoré. Deux passages globaux PostgreSQL se sont arrêtés en fin de groupe sans pile exploitable ; relances isolées puis passage complet détaillé verts, cause initiale inconnue. Aucun délai/assertion ni nettoyage commun assoupli pour obtenir ce résultat. Détail et limites dans les décisions ; pas de preuve de déploiement ou de disparition garantie de cette instabilité.

**État après tâche 10 :** quinze fichiers, **155 tests PostgreSQL réels et 347 tests généraux réussis**, aucun ignoré, HTTPS inclus. [Repas/assiettes/ICS](POSTGRESQL-REPAS.md) testés avec mêmes contrats HTTP et vrais conflits après attente du verrou ; rollback après enfants/retrait et lecture cohérente vérifiés. Même variante TAP ci-dessous avec quinze fichiers ; sans binaires, dix-sept parents refusés avant préparation (code 1), aucun ignoré. Aucun dossier de cluster observé dans les deux emplacements temporaires utilisés après le passage final. Code et docs locaux, pas de déploiement/bascule, données privées ou validation Docker/Linux/CI PostgreSQL/Ubuntu/appareil ; prochaine tâche à ce point historique 11.

**État actuel après tâche 11 :** dix-sept fichiers, **176 tests PostgreSQL réels et 367 tests généraux réussis**, aucun ignoré, HTTPS inclus. [Semaines/déplacements/restes](POSTGRESQL-SEMAINES.md) testés sur les deux moteurs, lots et remappage annulés après erreur, snapshots/quota/capacité et conflits réels sous verrou. Sans binaires, dix-neuf parents refusés avant préparation (code 1), aucun ignoré. Une erreur EBUSY de retrait après arrêt de la fixture a été reproduite : `fs.rm` dispose désormais de cinq reprises de retrait, délai linéaire de 100 ms, sans rejouer de SQL ou assouplir les vérifications d'appartenance. Une erreur persistante fait toujours échouer le test ; les anciens incidents inconnus ne sont pas réattribués. Clusters absents des deux emplacements temporaires après le passage final ; code local, aucune bascule ou donnée réelle, prochaine 12.

Pour diagnostiquer sur PowerShell avec le reporter TAP, placer l'option **avant les chemins**. Les fichiers de la commande standard peuvent être réutilisés sans en retirer :

```powershell
$postgresTestFiles = ((Get-Content package.json -Raw | ConvertFrom-Json).scripts.'test:postgres' -split ' ') | Select-Object -Skip 3
node --test --test-reporter=tap --test-concurrency=1 @postgresTestFiles
```

C'est cette variante avec les treize mêmes fichiers, seul reporter changé, qui a produit le passage complet final de 09. Ajouter l'option après les chemins via npm n'avait pas modifié le reporter sur cette version de Node.

Clôture étape 12 (26 octobre 2026) : 378 tests généraux et 187 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus. 140 comparaisons synthétiques identiques, trois cycles de relecture réconciliés ; modules/image et audit npm sans alerte. Absence des binaires : 21 parents en échec explicite, aucun ignoré. Aucun déploiement ou donnée réelle. Commande PostgreSQL standard : 19 fichiers, 21 tests parents. Prochaine étape 13.

Clôture étape 13 (26 octobre 2026) : 386 tests généraux et 199 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; modules/image vérifiés sans Docker. Deux cycles de relecture séparée réconciliés. Aucun déploiement, donnée réelle, publication ou validation appareil. Treize tâches closes, dix restantes, prochaine 14. La commande PostgreSQL contient 21 fichiers et 23 parents. SQLite reste actif ; reprise/sauvegarde/exploitation des étapes 14–23 encore à faire.

Clôture étape15 : 397 tests généraux et 211 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; contrôle image/modules réussi sans Docker. Trois cycles de relecture séparée réconciliés. Aucune donnée réelle, bascule, publication ou validation Ubuntu/appareil. Matrice PostgreSQL24fichiers/26parents ; 211tests finaux, dont CLI réels et coupure aprèsCOMMIT.

26 octobre 2026 : étapes 01–16 closes, sept restantes ; prochaine 17, restauration du foyer. 401 tests généraux et 215 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus. Contrôle image/modules réussi sans Docker. Sauvegarde JSON cohérente des 18 tables, accès exclus, téléchargement navigateur synthétique vérifié. Aucune donnée privée, bascule, publication ou validation Ubuntu/Safari/iPhone.

26 octobre 2026 : étapes 01–17 closes, six restantes ; prochaine 18, sauvegarde de l’instance complète. 403 tests généraux et 226 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; 26 fichiers et 28 parents dans la commande PostgreSQL. Trois cycles de relecture réconciliés. Contrôle image/modules réussi sans Docker. SQLite normal conservé, aucun candidat partiel activé, aucune donnée privée, publication, bascule ou validation Ubuntu/appareil.

26 octobre 2026 : étapes 01–18 closes, cinq restantes ; prochaine 19, candidat et vérification Docker. 404 tests généraux et 231 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; 27 fichiers et 29 parents PostgreSQL. Vrais pg_dump/pg_restore sur deux clusters privés, reconnexion HTTP avec compte restauré et commande verify exécutée. Trois cycles de relecture réconciliés, dernier défaut de manifeste corrigé et testé avant connexion. Modules/image contrôlés sans Docker. Aucun serveur personnel, donnée réelle, bascule ou publication.

26 octobre 2026 : étapes 01–18 closes ; 19a (raccordement natif du candidat) réalisée, 19b Docker/Linux encore ouverte. 404 tests généraux et 238 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; 28 fichiers et 30 parents PostgreSQL. Commande sans binaires : 30 échecs explicites, zéro succès/ignoré, code 1 attendu. Modules/image et 36 documents/321 liens locaux vérifiés. Trois cycles de relecture réconciliés et parcours navigateur sur vrai PostgreSQL synthétique passé. Aucune donnée réelle déplacée ni publication.

## Parcours natif HTTPS du guide — 27 octobre 2026

La sonde d’image/restauration vérifie désormais son serveur source en HTTPS avec une vraie CA locale et un cookie `Secure`, en plus du secours PostgreSQL sur cluster distinct. Le client de test utilise HTTPS Node avec la CA explicite et vérifie le refus sans celle-ci ; les assertions de conteneur restent adaptées au harnais natif. OpenSSL doit être disponible dans PATH ou indiqué par `OPENSSL`, comme pour la suite générale et le runner prévu. Aucun test n’est ignoré s’il manque. Cette preuve n’installe pas de confiance sur un téléphone et ne valide pas le profil Docker permanent ; voir [le guide préparatoire](POSTGRESQL-ADMIN.md).
