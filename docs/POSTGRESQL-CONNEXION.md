# PostgreSQL — frontière asynchrone

22 octobre 2026 — tâche 04 du [plan validé](MIGRATION-POSTGRESQL.md). **Le produit reste sur SQLite.** Ce socle est testé séparément ; [connexion et sessions](POSTGRESQL-AUTH.md), [invitations et administration](POSTGRESQL-ACCES.md) sont désormais testées dans le candidat isolé de 05–06. Routes du foyer, sauvegardes et déploiement/branchement CLI PostgreSQL restent à porter.

## Interface interne

`db/postgres.js` exporte `openPostgres(config)`. Importer le module ne crée ni pool ni connexion. L'ouverture construit un pool borné et attend une sonde `SELECT 1` ; un échec ferme le pool et rejette la promesse. Aucun appel SQLite, création de fichier, amorçage ou migration de schéma dans ce module.

| Appel | Contrat |
| --- | --- |
| `await openPostgres(config)` | Connexion utilisable, pas preuve de schéma/version/droits métier prêts. |
| `await db.query(sql, values)` | Paramètres PostgreSQL, client réservé jusqu'au résultat, puis rendu au pool. |
| `await db.transaction(async tx => …)` | Un seul client, BEGIN READ COMMITTED / COMMIT ou ROLLBACK. Le résultat du callback est conservé. |
| `await db.check()` | Sonde de connectivité ; efface le dernier code d'erreur idle après succès, pas un futur healthcheck applicatif. |
| `await db.close()` | Refuse les nouveaux travaux, draine les opérations acceptées et leurs acquisitions, puis ferme le pool. |

`state` vaut `open`, `closing` ou `closed`. `lastErrorCode` rend observable un incident de connexion/événement idle sans journaliser SQL, hôte ou identifiants. La sonde de démarrage n'autorise pas une bascule du produit.

Les résultats gardent les types par défaut du pilote (`bigint`/`count` notamment en texte) : aucun parseur global ni conversion silencieuse. Les DTO et validations numériques des parcours métier seront portés explicitement à partir de 05 ; ce module n'est pas un adaptateur des fonctions SQLite synchrones.

## Configuration et TLS

Le serveur normal lit `MANGER_STORAGE` : absent ou `sqlite` garde le lancement SQLite sécurisé, `postgres` provoque pour l'instant `MANGER_POSTGRES_NOT_READY` **avant l'ouverture des bases/comptes et avant l'écoute**. Valeur inconnue, vide ou mal orthographiée = `MANGER_STORAGE_INVALID`, jamais un repli. Ne pas activer `postgres` en déploiement à ce stade. Le harnais avec base explicitement injectée reste un outil de test, pas un mode de production. `db/storage.js` ne lit aucun fichier et n'importe aucun pilote.

Champs admis uniquement : `host`, `port`, `user`, `password`, `database`, `ssl`. Les coordonnées et un mot de passe non vide sont explicites ; pas de `connectionString` ni de mot de passe vide reprenant les variables PG. La configuration est reconstruite, pas étalée dans le constructeur. TLS vérifié par défaut, autorité PEM facultative via `ssl.ca`, impossible de fournir `rejectUnauthorized: false` ou un callback désactivant le contrôle. `ssl: false` est réservé aux adresses littérales `127.0.0.1` et `::1` des tests locaux.

Pool de quatre connexions, acquisition 2 s, délai de requête client 3 s, `statement_timeout` serveur 2 s et session inactive en transaction 10 s. `search_path=pg_catalog`, noms métier à qualifier (`household.…`, `auth.…`), encodage UTF-8, nom d'application constant. Les coordonnées, TLS et options explicites ne sont pas repris depuis PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGSSLMODE/PGOPTIONS. Ce n'est pas un effacement général de toutes les variables d'environnement reconnues par le pilote.

Le futur réseau Docker et sa politique TLS restent à spécifier en 19 ; pas de désactivation TLS générale pour contourner un nom de service distant. La vérification TLS distante n'est pas validée par les essais loopback sans TLS.

## Transactions et erreurs

Le SQL est une interface **interne de confiance**, jamais un endpoint de SQL utilisateur. Utiliser les paramètres pour les valeurs ; le callback ne doit pas émettre BEGIN/COMMIT/ROLLBACK, ouvrir une transaction imbriquée ou détourner une connexion. Il n'y a pas de faux parseur SQL par expressions régulières. Les requêtes doivent être attendues ; celles déjà démarrées sont toutefois drainées avant COMMIT, et une erreur SQL interceptée par le callback impose quand même ROLLBACK. Toute exception du callback, même `throw undefined`, annule. Une référence `tx` échappée est inutilisable dès le retour du callback.

Un client réservé a son propre listener `error`, installé dans le callback synchrone de remise par le pilote, avant toute reprise de promesse ; y compris pendant un callback momentanément sans SQL. Les événements idle du pool sont aussi traités. Un client ayant subi une erreur est détruit, pas réutilisé dans un état inconnu. Codes SQLSTATE conservés, message générique sans données privées et cause interne non énumérable pour diagnostic contrôlé. Ne pas sérialiser les causes dans une future réponse HTTP. Une exception métier est rendue au caller après rollback ; un échec du rollback est explicitement distingué. `lastErrorCode` suit uniquement les acquisitions/événements de connexion, pas toutes les erreurs SQL et pas la santé globale du produit.

**Pas de nouvelle tentative automatique.** Un délai client ou une coupure ne garantit pas l'annulation d'une écriture côté serveur : en autocommit comme pendant COMMIT, le résultat peut rester indéterminé. Détruire le client évite sa réutilisation, pas les effets déjà validés. La reprise métier/idempotence reste à traiter par parcours.

## Fermeture et limites

Les travaux déjà acceptés peuvent finir pendant `closing`, pas de nouvelle admission. Après 5 s de drainage, seuls les clients de ce pool sont détruits, leurs travaux rejetés avec `POSTGRES_CLOSE_TIMEOUT` et un callback repris tardivement ne peut plus envoyer COMMIT. Une acquisition encore en attente est suivie jusqu'à son retour/échec (délai de connexion 2 s) ; si elle retourne après expiration, son client est détruit avant tout SQL. La fermeture attend ces acquisitions puis `pool.end()` ; elle est idempotente et conserve son échec si forcée.

Les 5 s ne sont donc pas une promesse de durée totale stricte d'arrêt du processus. Le module ne peut pas arrêter le JavaScript arbitraire d'un callback ; il lui retire l'autorité SQL. Il n'installe encore aucun handler de signal et n'est pas branché dans le serveur SQLite. Arrêt brutal du système, destruction du processus et résultat distant d'un COMMIT interrompu restent hors garantie.

## Preuves locales de la tranche 04a

Douze tests sans serveur : import/configuration/TLS, erreurs privées, transaction et scope, rollback même si erreur interceptée/exception sans valeur, drainage, perte du client réservé, acquisition tardive et coupure exactement à la remise du client. Dix tests PostgreSQL 18.6 réels, sans omission : paramètres/Unicode, client réservé distinct d'une requête concurrente, rollback, portée, timeout, environnement erroné, mauvaise authentification, panne/reprise, fermeture gracieuse et forcée. Fixture sans données privées, pool fermé avant le cluster et nettoyage protégé.

Trois tests supplémentaires de sélection/lancement normal : modes refusés sans fichier créé ni écoute, SQLite par défaut et explicite avec comptes toujours obligatoires, API du foyer refusée sans session et page de connexion présente. Seules des bases temporaires synthétiques sont ouvertes.

Sources primaires : [pool et événements](https://node-postgres.com/apis/pool), [client et délais](https://node-postgres.com/apis/client), [transactions sur un seul client](https://node-postgres.com/features/transactions), [TLS](https://node-postgres.com/features/ssl). Versions et privilèges : [environnement de test](POSTGRESQL-TEST.md), [schéma](POSTGRESQL-SCHEMA.md). Ni build Docker, essai Ubuntu, migration réelle ou validation téléphone.

## Distribution et clôture de 04

Le module runtime existe et son chargement est contrôlé : `pg@8.23.1` devient une dépendance de production, sans changer sa version ni celles des transitives. `npm ci --omit=dev --ignore-scripts` réussi, audit sans vulnérabilité signalée et quinze signatures de registre/une attestation vérifiées le 22 octobre. Premier essai hors ligne interrompu faute de cache npm complet ; réinstallation depuis le registre avec le même verrou, puis suites repassées. Ce n'était pas une régression métier. La première sonde de mutation manquait de `Buffer` dans son contexte VM ; après ajout à la sonde, suppression de COMMIT uniquement en mémoire détectée par l'assertion du contrat, aucun fichier produit modifié.

Les [notices complètes](../public/third-party-notices.txt), versions et copyrights sont repris des fichiers LICENSE ou sections de README installés, y compris pg-types et pgpass ; une garde compare leur présence intégrale à chaque paquet de production. Le résumé partagé Connexion/Compte mentionne MIT/ISC sans nouveau contrôle, requête ou écran. Le guide frontend conduit à garder la rubrique fermée et les styles existants ; seuls des mots sont ajoutés, pas de validation visuelle sur appareil revendiquée.

`image-check.js` charge désormais aussi les modules de `db/` récursivement et exige le module d'entrée PostgreSQL ainsi que les notices ; aucune connexion PostgreSQL au build. Les copies de packaging vérifient l'absence de fichiers et un nouveau module imbriqué. Le vrai contexte/image Docker et l'intégration CI PostgreSQL restent à valider en 19–20, pas simulés comme acquis par ces contrôles Node. Compose et les volumes SQLite restent identiques.

Clôture locale : **249 tests généraux réussis**, HTTPS inclus ; **28 tests PostgreSQL réels réussis**, aucun ignoré. Commande agrégée sans binaires : échec attendu avant création des clusters, pas de succès avec tests omis. `node image-check.js` réussi après installation de production. Point de contrôle A atteint pour le socle isolé ; étape suivante 05, connexion/sessions. Aucun portage métier, transfert privé, accès Ubuntu, build Docker, essai téléphone ou publication Codeberg dans ce lot.

Point de contrôle suivant, 05 réalisé : [contrat connexion/sessions et preuves](POSTGRESQL-AUTH.md), **264 tests généraux et 53 PostgreSQL réels réussis**, aucun ignoré, HTTPS inclus. Les nombres et l'étape suivante du paragraphe précédent sont l'historique de 04 ; prochaine tâche actuelle 06, invitations/administration. La sélection au lancement et les limites de déploiement restent inchangées.

État après 06 : [contrat invitations/administration et récupération](POSTGRESQL-ACCES.md), **282 tests généraux et 81 PostgreSQL réels réussis**, aucun ignoré, HTTPS inclus. Prochaine tâche actuelle 07, personnes/protéines ; la sélection au lancement et les limites de déploiement/CLI restent inchangées.
