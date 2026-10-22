# PostgreSQL — frontière asynchrone

22 octobre 2026 — tâche 04 du [plan validé](MIGRATION-POSTGRESQL.md). **Le produit reste sur SQLite.** Ce socle est testé séparément ; les accès, routes métier, sauvegardes et le déploiement PostgreSQL ne sont pas encore portés.

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

## Configuration et TLS

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

Sources primaires : [pool et événements](https://node-postgres.com/apis/pool), [client et délais](https://node-postgres.com/apis/client), [transactions sur un seul client](https://node-postgres.com/features/transactions), [TLS](https://node-postgres.com/features/ssl). Versions et privilèges : [environnement de test](POSTGRESQL-TEST.md), [schéma](POSTGRESQL-SCHEMA.md). Ni build Docker, essai Ubuntu, migration réelle ou validation téléphone.
