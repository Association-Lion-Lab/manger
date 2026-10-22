# PostgreSQL — connexion et sessions

22 octobre 2026 — tâche 05 du [plan](MIGRATION-POSTGRESQL.md), en cours. **Le lancement normal reste SQLite ; PostgreSQL incomplet est toujours refusé.** Aucun compte ou mot de passe réel n'est lu, créé ou transféré dans ce lot.

## Dépôt de persistance (05a)

`postgresAuth(db)` dans `db/auth.js` reçoit la [frontière asynchrone](POSTGRESQL-CONNEXION.md) déjà ouverte ; il n'ouvre rien à l'import ni à sa construction. Six opérations explicites, sans traduction automatique du SQL SQLite ni gestion des invitations/administration de 06 :

| Opération | Effet |
| --- | --- |
| `findUser(name)` | Lit le compte avec ID numérique sûr, flags 0/1 et hachage interne ; nom inconnu/NUL sans résultat. |
| `session(token)` | Reçoit uniquement le jeton déjà haché ; exige compte actif et expiration absolue après la lecture SQL, sans prolongation. |
| `throttle(keys)` | Compteurs partagés : nettoyage/lecture/incrémentation des trois clés atomiques sous verrou transactionnel dédié. |
| `startSession(snapshot, token)` | Revalide compte actif et mot de passe sous verrou, insère un jeton haché valable sept jours. |
| `logout(user, all)` | Retire le seul jeton ou toutes les sessions du compte authentifié ; aucun ID fourni par le client utilisé. |
| `changePassword(user, encoded)` | Compte verrouillé puis session du même compte, encore valide ; remplacement et révocation de toutes ses sessions dans la même transaction. |

Les paramètres SQL restent séparés du texte et les schémas qualifiés `auth.…`. L'ID est converti explicitement par `::float8`, borné par le schéma initial aux entiers sûrs JavaScript ; aucun parseur global du pilote. Les hachages et jetons restent internes au middleware, pas dans le DTO public de compte.

## Menaces et sérialisation

Le navigateur contrôle identifiant/mot de passe/cookie, jamais le compte cible d'une révocation, les privilèges SQL ou le choix du moteur. Actifs protégés : hachages, jetons, données du foyer et droits administrateur. Cas d'abus à vérifier : session expirée, compte désactivé ou réinitialisé pendant le hachage ; deux changements concurrents ; tentatives simultanées ; accès/export sans droit ; panne dont l'erreur révélerait une requête ou un secret.

Les mutations de sessions prennent d'abord le verrou de ligne du compte (`FOR UPDATE`), puis celui de la session si nécessaire. Le hachage scrypt reste **hors transaction SQL**. Le changement de mot de passe revalide le hachage utilisé avant scrypt, `active=1`, le lien session/compte et l'expiration **après les attentes de verrou**, pas avec `now()` figé au début de transaction. Une future commande d'administration devra conserver cet ordre. Une déconnexion globale n'empêche pas une nouvelle connexion ultérieure avec des identifiants encore valides ; aucun nouvel epoch de compte ajouté.

Le verrou consultatif `(1296125511,2)` est dédié aux compteurs (migration : suffixe 1). Il les sérialise entre pools/processus de la même base, sans maintenir ce verrou pendant scrypt. Les plafonds restent décidés dans le middleware : global 60, IP hachée 20, identifiant haché 8 sur quinze minutes, et pas de remise à zéro au succès. Pas de permission SQL ou de table supplémentaire. Le nettoyage global des sessions expirées précède le verrou compte pour éviter un ordre de verrouillage croisé entre comptes.

Sources : [verrous de lignes et consultatifs PostgreSQL 18](https://www.postgresql.org/docs/18/explicit-locking.html), [READ COMMITTED et visibilité après attente](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED), [transaction sur le même client pg](https://node-postgres.com/features/transactions). Le rôle reste limité par le [schéma de 03](POSTGRESQL-SCHEMA.md).

## Preuves et limites

05a : absence du module en rouge, puis sept tests PostgreSQL réels réussis, aucun ignoré : ID supérieur à 32 bits, session/expiration, compte désactivé, ancien hachage invalidé, retrait ciblé/global, changement et révocation, compteurs sous concurrence de deux pools. Bases de test jetables uniquement. Middleware HTTP et preuves de courses pendant scrypt à compléter avant clôture ; ne pas présenter ces tests de dépôt comme un parcours de connexion complet. Ni migration de comptes, changement Compose, build Docker, publication, essai Ubuntu/téléphone ou bascule du produit.
