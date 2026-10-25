# PostgreSQL — personnes, préférences et protéines

25 octobre 2026 — tâche 07 réalisée du [plan](MIGRATION-POSTGRESQL.md). Le produit et les commandes standard restent SQLite ; aucun compte, profil ou planning réel utilisé. Pas de refonte client, nouvelle collecte ou modification du schéma. [Contrats de référence](POSTGRESQL-CONTRATS.md), [accès déjà portés](POSTGRESQL-ACCES.md).

## Contrat et périmètre

`GET /api/household`, `PUT /api/household/preferences`, `POST/PUT/DELETE /api/members[/:id]` et `/api/proteins[/:id]` conservent leurs réponses JSON et validations. Personne à table et compte de connexion sont distincts : le retrait d'une personne supprime ses affectations aux repas, jamais le compte, les recettes ou le repas lui-même. Les portions globales du repas ne sont pas recalculées automatiquement, comme avant.

Le nom d'un membre reste sensible à la casse ; les protéines et goûts sont normalisés en minuscules françaises. Goûts individuels/global : liste de 50 entrées au plus, cru/cuit/état inconnu inchangés ; ce ne sont pas des allergies. Omettre les goûts lors d'une édition conserve le texte JSON existant ; une liste vide les efface. La modification d'un régime ne réécrit ni ne revalide rétroactivement tous les repas, conformément au comportement actuel.

Une protéine référencée par une affectation ou une assiette ne peut pas être supprimée. Sa catégorie ne peut devenir incompatible avec les personnes des deux tables. Une assiette sans supplément (`protein_id IS NULL`) reste telle quelle ; pas de protéine ajoutée par défaut. Création du schéma, amorçage et transfert de données existantes restent séparés.

## Frontières et choix

Lecture PostgreSQL en une requête agrégée, pour un seul instantané cohérent et sans conversion globale du pilote ; IDs numériques sûrs et JSON des goûts explicitement interprété. Mutations sur client réservé, SQL paramétré et schéma `household` qualifié. Verrou transactionnel dédié `(1296125511,4)` pour sérialiser le remplacement des goûts et les écritures de profils/protéines ; pas de verrou conservé pendant une lecture du corps HTTP.

Les futurs écrivains de repas PostgreSQL devront prendre ce même verrou **avant** lecture des personnes/protéines et validation. Ils restent à porter en 10–11 ; une application partielle n'est pas activée en production. Ce protocole ne prétend pas protéger contre des requêtes SQL externes qui contournent la validation applicative. Les clés étrangères gardent leur protection sur les références et cascades.

La lecture/création/édition expose des données du foyer uniquement derrière l'authentification déjà testée ; aucun rôle administrateur supplémentaire n'est requis pour les profils, comme avant. Entrées non fiables validées au bord HTTP ; erreurs métier lisibles en 400, erreurs SQL internes privées en 503. Aucun repli ou mélange de bases pour le candidat de test ; le lancement normal PostgreSQL reste refusé.

Sources consultées : [instantanés READ COMMITTED](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED), [verrous de lignes et consultatifs](https://www.postgresql.org/docs/18/explicit-locking.html), [transactions sur un même client pg](https://node-postgres.com/features/transactions). Cette documentation n'est pas une preuve d'exécution : résultats et limites seront ajoutés après tests.

07a : dépôt des huit opérations et règles pures partagées avec les exports historiques du serveur. Les goûts restent stockés comme JSON texte, pas de migration automatique. Seules les collisions des contraintes de nom sont traduites en erreurs métier ; une collision de clé primaire ne doit pas être présentée comme un simple nom déjà utilisé. Aucun branchement HTTP PostgreSQL à ce point.

Écart de saisie borné : PostgreSQL refuse l'octet NUL dans un champ SQL texte. Les noms de membre/protéine, unités et goûts globaux le refusent donc explicitement sur les deux moteurs, sans le supprimer silencieusement. Les goûts personnels JSON conservent leur comportement existant (NUL échappé, liste omise ou vide distinctes). Pas d'élargissement du refus à d'autres caractères ni de réécriture d'anciennes données ; la future analyse d'import devra signaler un tel champ texte source.

Preuve intermédiaire : cinq scénarios du dépôt réel réussis, avec les contrôles de fixture (14 tests au total). Le test de saisie NUL est passé en rouge avant extraction ; les contrats HTTP, les courses et la clôture restent à réaliser.

07b : `db/household-sqlite.js` garde les calculs synchrones ; `household-http.js` applique les mêmes règles aux deux dépôts. Le handler SQLite normal conserve la garde de restauration et son compteur de requêtes actives. Le harnais interne `createHouseholdHandler` est protégé par `protectAccounts` dans les tests ; il refuse en 503 tout autre parcours, sans ouverture SQLite de secours ni activation par configuration. Corps HTTP borné à 32 768 octets avant transaction, identifiants entiers sûrs avant SQL, zéro historique accepté et regex de chiffres inchangé. Aucune erreur SQL divulguée : doublons en 400 avec messages lisibles, panne interne en 503 privé. Le contrat a reproduit en rouge l'ancien message SQL de doublon, le NUL global accepté et l'erreur interne rendue en 400.

Preuve ciblée 07b–07c : 26 tests SQLite/règles/formulaires, puis 16 tests PostgreSQL réels réussis, aucun ignoré. Les sept mêmes scénarios HTTP passent sur les deux moteurs. Attente réelle du verrou observée avec le rôle applicatif : un passage au régime vegan pendant l'attente fait refuser la catégorie œuf sur les deux tables de repas. Deux remplacements concurrents ne fusionnent pas les goûts ; une lecture pendant une écriture non engagée voit l'état précédent entier. L'erreur injectée après DELETE annule le remplacement ; l'écriture suivante fonctionne. Suite complète et vérification navigateur encore attendues à ce stade.

Le hachage synthétique du contrat HTTP PostgreSQL est préparé avec le helper historique et SQLite en mémoire, puis copié dans la fixture PostgreSQL ; les requêtes d'authentification et de foyer utilisent ensuite PostgreSQL. Ce n'est ni un accès aux fichiers privés ni une preuve qu'aucune ouverture SQLite n'a eu lieu dans la préparation. Le test SQLite supplémentaire injecte un échec après cascade de retrait et après effacement des goûts : état entier à préserver, puis reprise sans erreur attendue.

## Vérifications du profil et limites

Navigateur Chromium local, bases SQLite en mémoire : connexion d'un compte membre, Compte → Personnes du foyer, création de Camille végétarien avec tomate crue, réouverture, ajout du brocoli cuit, enregistrement et nouvelle réouverture conservant les deux goûts. Capture inspectée, aucune erreur ni avertissement capturé en console ; onglet/serveur temporaires fermés. Le rôle « checkbox » du relevé natif différait du bouton dans le DOM ; sélecteurs du harnais ajustés aux commandes observées, aucun fichier UI modifié. Aucun retrait destructif effectué par le navigateur ; les tests HTTP/SQL isolés couvrent le retrait. Les suites VM du profil couvrent aussi double appui, erreurs et confirmation.

Ce parcours ne prouve ni l'interface sur une application entièrement PostgreSQL (recettes/planning non portés), ni Safari/iPhone, Android, Linux/Docker ou le serveur personnel. Les affectations PostgreSQL sont semées par SQL synthétique uniquement pour vérifier les références et cascades, pas pour prétendre que le planning est porté. Une mutation en mémoire supprimant le contrôle d'entier sûr est détectée par le harnais de frontière HTTP, sans altérer la source produit. Relecture séparée du contrat puis du code en trois cycles ; correction de l'identifiant zéro revue une nouvelle fois sur le seul diff.

## Résultat final

**294 tests généraux et 97 tests PostgreSQL réels réussis**, aucun ignoré, HTTPS inclus, après la correction zéro. Neuf fichiers de suites PostgreSQL agrégés ; absence des binaires = refus attendu code 1, onze parents en échec avant préparation, aucun ignoré. Contrôle des modules distribués réussi sans base persistante ; cela ne constitue pas un build Docker. Les réglages d'ordonnancement de tests et la préparation du cluster sont expliqués dans [le guide de test](POSTGRESQL-TEST.md).

Foyer/comptes réels, dépendances/verrou, schéma, interface, Compose et volumes inchangés ; aucun cluster de test restant observé dans les emplacements temporaires utilisés, aucun listener de démonstration conservé. Code enregistré localement, sans publication, sans bascule ou transfert de données ; tâche 08 non commencée. L'audit npm signale une alerte modérée Nodemailer existante, avec [triage et mise à jour à prévoir avant publication](DECISIONS.md) ; aucun audit externe Gemini exécuté.
