# PostgreSQL — connexion et sessions

22 octobre 2026 — tâche 05 du [plan](MIGRATION-POSTGRESQL.md) réalisée et testée sur données jetables. **Le lancement normal reste SQLite ; PostgreSQL incomplet est toujours refusé.** Aucun compte ou mot de passe réel n'est lu, créé ou transféré dans ce lot.

## Dépôt de persistance (05a)

`postgresAuth(db)` dans `db/auth.js` reçoit la [frontière asynchrone](POSTGRESQL-CONNEXION.md) déjà ouverte ; il n'ouvre rien à l'import ni à sa construction. Six opérations explicites, sans traduction automatique du SQL SQLite ni gestion des invitations/administration de 06 :

| Opération | Effet |
| --- | --- |
| `findUser(name)` | Lit le compte avec ID numérique sûr, flags 0/1 et hachage interne ; nom inconnu/NUL sans résultat. |
| `session(token)` | Reçoit uniquement le jeton déjà haché ; exige compte actif et expiration absolue après la lecture SQL, sans prolongation. |
| `throttle(keys)` | Compteurs partagés : nettoyage/lecture/incrémentation des trois clés atomiques sous verrou transactionnel dédié. |
| `startSession(snapshot, token)` | Revalide compte actif et mot de passe sous verrou, insère un jeton haché valable sept jours. |
| `logout(user, all)` | Revalide le jeton/compte sous verrou, puis retire le seul jeton ou toutes ses sessions ; false sans mutation si preuve révoquée/expirée. Aucun ID fourni par le client utilisé. |
| `changePassword(user, encoded)` | Compte verrouillé puis session du même compte, encore valide ; remplacement et révocation de toutes ses sessions dans la même transaction. |

Les paramètres SQL restent séparés du texte et les schémas qualifiés `auth.…`. L'ID est converti explicitement par `::float8`, borné par le schéma initial aux entiers sûrs JavaScript ; aucun parseur global du pilote. Les hachages et jetons restent internes au middleware, pas dans le DTO public de compte.

## Menaces et sérialisation

Le navigateur contrôle identifiant/mot de passe/cookie, jamais le compte cible d'une révocation, les privilèges SQL ou le choix du moteur. Actifs protégés : hachages, jetons, données du foyer et droits administrateur. Cas d'abus à vérifier : session expirée, compte désactivé ou réinitialisé pendant le hachage ; deux changements concurrents ; tentatives simultanées ; accès/export sans droit ; panne dont l'erreur révélerait une requête ou un secret.

Les mutations de sessions prennent d'abord le verrou de ligne du compte (`FOR UPDATE`), puis celui de la session si nécessaire. Le hachage scrypt reste **hors transaction SQL**. Le changement de mot de passe revalide le hachage utilisé avant scrypt, `active=1`, le lien session/compte et l'expiration **après les attentes de verrou**, pas avec `now()` figé au début de transaction. Une future commande d'administration devra conserver cet ordre. Une déconnexion globale n'empêche pas une nouvelle connexion ultérieure avec des identifiants encore valides ; aucun nouvel epoch de compte ajouté.

Le verrou consultatif `(1296125511,2)` est dédié aux compteurs (migration : suffixe 1). Il les sérialise entre pools/processus de la même base, sans maintenir ce verrou pendant scrypt. Les plafonds restent décidés dans le middleware : global 60, IP hachée 20, identifiant haché 8 sur quinze minutes, et pas de remise à zéro au succès. Pas de permission SQL ou de table supplémentaire.

Le nettoyage des sessions expirées précède le verrou compte, par lot de 100 lignes avec CTE matérialisée et `FOR UPDATE SKIP LOCKED` ([syntaxe et limite d'usage](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE)). Cela évite d'attendre une session détenue par un changement de mot de passe et le croisement purge/révocation. Une session verrouillée ou au-delà du lot est laissée à une connexion suivante pour la purge, mais demeure immédiatement inutilisable après expiration ; pas de promesse de suppression physique à l'instant exact d'expiration ni de tâche de purge ajoutée. Les opérations d'autorisation n'utilisent jamais SKIP LOCKED pour ignorer un contrôle.

Sources : [verrous de lignes et consultatifs PostgreSQL 18](https://www.postgresql.org/docs/18/explicit-locking.html), [READ COMMITTED et visibilité après attente](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED), [transaction sur le même client pg](https://node-postgres.com/features/transactions). Le rôle reste limité par le [schéma de 03](POSTGRESQL-SCHEMA.md).

## Preuves et limites

05b : `protectAccounts` partage les six opérations attendables avec `sqliteAuth` ou un dépôt PostgreSQL explicitement injecté **sans base SQLite** ; fournir les deux est refusé. Le serveur normal ne choisit toujours pas PostgreSQL. Les scrypt, jetons SHA-256, cookie `manger_session` HttpOnly/SameSite=Strict/Secure selon HTTPS et Max-Age sept jours restent identiques. La place dans la garde locale de deux hachages est réservée avant le premier await de limitation ; les invitations SQLite utilisent cette même réservation sans porter leur SQL.

Les sessions sont attendues avant de décider des droits, jamais traitées comme un objet Promise truthy. Candidat PostgreSQL : accès/invitation/administration et sauvegarde non portés refusés avec 503 après les contrôles 401/403 pertinents, sauf certificat public d'autorité déjà protégé par le rôle ; envoi SMTP non annoncé actif. Aucun appel SQL SQLite de secours. Les erreurs internes PostgreSQL deviennent un 503 générique, sans SQL/identifiants/cause ; seules les erreurs de saisie explicitement identifiées gardent leur 400 lisible. Les corps JSON non objets, nuls ou trop gros sont refusés avant accès au dépôt.

Au point de contrôle 05b, trente-deux tests ciblés passaient après branchement : anciens comptes SQLite, trois tests du dépôt SQLite (dont rollback si révocation échoue après UPDATE), sept tests de dépôt PostgreSQL et même contrat HTTP à cinq scénarios sur les deux moteurs. Les scénarios PostgreSQL utilisent des hachages scrypt réellement produits par le code SQLite en mémoire, puis placés synthétiquement dans la fixture ; ce n'est pas l'import de comptes réels. Le handler métier PostgreSQL est une sentinelle HTTP, pas une implémentation du foyer ou des exports : seuls les contrôles d'accès et réponses d'authentification sont prouvés.

Preuve historique 05a : absence du module en rouge, puis sept tests PostgreSQL réels réussis, aucun ignoré : ID supérieur à 32 bits, session/expiration, compte désactivé, ancien hachage invalidé, retrait ciblé/global, changement et révocation, compteurs sous concurrence de deux pools. À ce stade le middleware restait à compléter ; ce n'était pas un parcours de connexion complet.

## Clôture 05c

Deux régressions de relecture ont échoué avant correction : purge immobilisée sur une session expirée verrouillée (timeout SQL 57014) et déconnexion différée supprimant une session neuve malgré révocation du jeton initial. Purge non bloquante et revalidation du logout corrigées ; la même revalidation est atomique sur SQLite. Expiration réelle pendant l'attente d'un verrou compte, rollback PostgreSQL après UPDATE puis erreur de révocation, panne/reprise de la base et absence d'erreur privée/cookie de succès également couverts.

Le helper de tests charge le vrai middleware dans une VM et retarde seulement la remise du callback **du vrai scrypt**. Désactivation, réinitialisation et déconnexion pendant l'attente sont ainsi déterministes sur les deux moteurs, sans hook ou faux algorithme ajouté au produit. Un throttle de test maintenu en attente prouve les deux places réservées avant await et le refus immédiat du troisième travail. Mutation en mémoire supprimant la revalidation du logout : la régression la détecte, aucun fichier de production altéré. Trois cycles de contre-relecture indépendante de contexte, corrections intégrées, aucun défaut concret supplémentaire signalé au dernier cycle ; pas d'audit par modèle/CLI externe revendiqué.

Résultat final : **264 tests généraux réussis**, HTTPS réel inclus ; **53 tests PostgreSQL réels réussis**, aucun ignoré. Commande `npm run test:postgres` à quatre suites, garde passée du rouge au vert. `node image-check.js` charge les nouveaux modules sans connexion ni base persistante ; les helpers restent exclus du contexte. Audit npm courant : aucune vulnérabilité signalée, verrou et versions des dépendances inchangés.

Binaires volontairement absents : la commande agrégée échoue explicitement (code 1, aucun test ignoré), sans créer de cluster. Aucun dossier de cluster temporaire restant observé après les validations dans les deux emplacements utilisés ; les outils portables ignorés sont conservés.

Les tests existants gardent les invitations, SMTP et administration SQLite. Leur version PostgreSQL, les commandes de récupération et la création de compte restent en **06**, puis les données du foyer dans les tâches suivantes. Aucun serveur PostgreSQL partiellement porté n'est proposé au déploiement ; Compose/volumes/UI inchangés. Ni migration de comptes, validation du vrai Docker/Linux ou de la CI PostgreSQL, essai Ubuntu/téléphone, sauvegarde PostgreSQL ou publication Codeberg dans ce lot.
