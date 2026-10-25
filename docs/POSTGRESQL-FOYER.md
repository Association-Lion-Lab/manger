# PostgreSQL — personnes, préférences et protéines

25 octobre 2026 — tâche 07 en cours du [plan](MIGRATION-POSTGRESQL.md). Le produit et les commandes standard restent SQLite ; aucun compte, profil ou planning réel utilisé. Pas de refonte client, nouvelle collecte ou modification du schéma. [Contrats de référence](POSTGRESQL-CONTRATS.md), [accès déjà portés](POSTGRESQL-ACCES.md).

## Contrat et périmètre

`GET /api/household`, `PUT /api/household/preferences`, `POST/PUT/DELETE /api/members[/:id]` et `/api/proteins[/:id]` conservent leurs réponses JSON et validations. Personne à table et compte de connexion sont distincts : le retrait d'une personne supprime ses affectations aux repas, jamais le compte, les recettes ou le repas lui-même. Les portions globales du repas ne sont pas recalculées automatiquement, comme avant.

Le nom d'un membre reste sensible à la casse ; les protéines et goûts sont normalisés en minuscules françaises. Goûts individuels/global : liste de 50 entrées au plus, cru/cuit/état inconnu inchangés ; ce ne sont pas des allergies. Omettre les goûts lors d'une édition conserve le texte JSON existant ; une liste vide les efface. La modification d'un régime ne réécrit ni ne revalide rétroactivement tous les repas, conformément au comportement actuel.

Une protéine référencée par une affectation ou une assiette ne peut pas être supprimée. Sa catégorie ne peut devenir incompatible avec les personnes des deux tables. Une assiette sans supplément (`protein_id IS NULL`) reste telle quelle ; pas de protéine ajoutée par défaut. Création du schéma, amorçage et transfert de données existantes restent séparés.

## Frontières et choix prévus

Lecture PostgreSQL en une requête agrégée, pour un seul instantané cohérent et sans conversion globale du pilote ; IDs numériques sûrs et JSON des goûts explicitement interprété. Mutations sur client réservé, SQL paramétré et schéma `household` qualifié. Verrou transactionnel dédié `(1296125511,4)` pour sérialiser le remplacement des goûts et les écritures de profils/protéines ; pas de verrou conservé pendant une lecture du corps HTTP.

Les futurs écrivains de repas PostgreSQL devront prendre ce même verrou **avant** lecture des personnes/protéines et validation. Ils restent à porter en 10–11 ; une application partielle n'est pas activée en production. Ce protocole ne prétend pas protéger contre des requêtes SQL externes qui contournent la validation applicative. Les clés étrangères gardent leur protection sur les références et cascades.

La lecture/création/édition expose des données du foyer uniquement derrière l'authentification déjà testée ; aucun rôle administrateur supplémentaire n'est requis pour les profils, comme avant. Entrées non fiables validées au bord HTTP ; erreurs métier lisibles en 400, erreurs SQL internes privées en 503. Aucun repli ou mélange de bases pour le candidat de test ; le lancement normal PostgreSQL reste refusé.

Sources consultées : [instantanés READ COMMITTED](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED), [verrous de lignes et consultatifs](https://www.postgresql.org/docs/18/explicit-locking.html), [transactions sur un même client pg](https://node-postgres.com/features/transactions). Cette documentation n'est pas une preuve d'exécution : résultats et limites seront ajoutés après tests.

07a : dépôt des huit opérations et règles pures partagées avec les exports historiques du serveur. Les goûts restent stockés comme JSON texte, pas de migration automatique. Seules les collisions des contraintes de nom sont traduites en erreurs métier ; une collision de clé primaire ne doit pas être présentée comme un simple nom déjà utilisé. Aucun branchement HTTP PostgreSQL à ce point.

Écart de saisie borné : PostgreSQL refuse l'octet NUL dans un champ SQL texte. Les noms de membre/protéine, unités et goûts globaux le refusent donc explicitement sur les deux moteurs, sans le supprimer silencieusement. Les goûts personnels JSON conservent leur comportement existant (NUL échappé, liste omise ou vide distinctes). Pas d'élargissement du refus à d'autres caractères ni de réécriture d'anciennes données ; la future analyse d'import devra signaler un tel champ texte source.

Preuve intermédiaire : cinq scénarios du dépôt réel réussis, avec les contrôles de fixture (14 tests au total). Le test de saisie NUL est passé en rouge avant extraction ; les contrats HTTP, les courses et la clôture restent à réaliser.
