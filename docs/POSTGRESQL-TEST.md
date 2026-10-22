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
| Pilote de test | `pg` **8.23.1**, dépendance de développement verrouillée avec ses dépendances transitives dans npm |

[PostgreSQL pour Windows](https://www.postgresql.org/download/windows/) renvoie vers les [archives EDB](https://www.enterprisedb.com/download-postgresql-binaries). L'empreinte est obtenue via HTTPS auprès du même éditeur : ce contrôle détecte une archive différente, mais n'est pas une signature indépendante des binaires. Une empreinte incorrecte bloque sans exécuter ni supprimer l'archive. Une extraction partielle ou une version inattendue bloque également, sans réparation destructive automatique.

Si une politique Windows interdit les scripts, ne pas modifier la politique globale : demander l'autorisation d'exécuter ce script connu dans un processus dédié. Le test de refus d'archive a nécessité un processus PowerShell 7 avec une autorisation limitée à ce processus ; aucun paramètre système n'a été modifié.

## Exécuter et isoler

`npm run test:postgres` lance exclusivement les tests réels de `test-support/postgres.integration.cjs`. `npm test` conserve la suite générale et les deux tests de garde de cette installation ; il ne remplace pas le passage PostgreSQL. Si les binaires nécessaires sont absents ou leur version différente, la commande PostgreSQL **échoue**, sans test ignoré ni connexion à une instance existante.

La fixture crée un répertoire temporaire neuf `manger-pg-test-*`, un marqueur aléatoire d'appartenance et un cluster avec authentification **SCRAM-SHA-256**. Le serveur écoute uniquement sur **127.0.0.1**, avec un port libre éphémère, sans socket Unix. Aucun port 5432 fixe ou accès réseau extérieur. La réservation du port est relâchée avant le démarrage ; si une autre application le prend entre-temps, le démarrage échoue, sans utiliser cette autre instance.

Le rôle de bootstrap et le rôle applicatif ont des mots de passe aléatoires par exécution. Le rôle applicatif est propriétaire de la seule base de test, sans superutilisateur, création de bases/rôles ou réplication. Ce n'est pas encore le contrat des rôles de production : il sera précisé avec le schéma cible. Les variables natives `PG*` sont retirées de l'environnement des sous-processus ; le pilote reçoit explicitement les coordonnées et identifiants de la fixture. Aucun secret réel, `.env`, `DATABASE_URL`, volume ou base SQLite n'est utilisé.

La connexion locale synthétique utilise `ssl: false` uniquement pour ce loopback jetable ; **ne pas reprendre ce choix pour une base distante**. Délai de connexion de 2 secondes, requête côté client de 3 secondes et `statement_timeout` serveur de 1 seconde. Pool de quatre connexions maximum, gestion des erreurs de connexions inactives et fermeture explicite. L'administrateur temporaire est fermé après création du rôle ; le fichier de mot de passe de bootstrap est retiré après `initdb`.

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
