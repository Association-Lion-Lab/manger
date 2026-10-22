# PostgreSQL — inventaire et contrats de référence

22 octobre 2026 — tâche 01 du [plan validé](MIGRATION-POSTGRESQL.md). **Le moteur exécuté reste SQLite.** Cette page fixe ce que le portage devra préserver ; elle ne prouve ni une connexion ni une migration PostgreSQL.

Inventaire de `server.js`, `accounts.js`, `backup-tools.js`, `restore.js`, `image-check.js`, des scripts Docker, des tests racine et de leurs consommateurs clients. Schémas ouverts uniquement en mémoire, jamais depuis les bases privées. Référence applicative : `5679528`, puis tests de caractérisation ajoutés sans changer le code applicatif.

## 1. Les 22 tables métier

Les IDs entiers existants restent des nombres JSON sûrs, y compris au-delà de 32 bits. Chaque table est comparée par ses clés et valeurs, pas seulement son nombre de lignes. Les tables de suivi des migrations PostgreSQL sont des métadonnées supplémentaires, pas des tables métier oubliées.

### Foyer — 18 tables, schéma SQLite 4

| Table | Colonnes à reprendre | Identité, relation ou vigilance |
| --- | --- | --- |
| `recipes` | `id, title, minutes, servings, tags, diet, instructions, source_url` | ID ; contraintes durée/portions/régime ; instructions anciennes et source facultative conservées. |
| `ingredients` | `id, name, unit` | ID ; unicité `(name, unit)`, sans fusion de variantes pendant la reprise. |
| `recipe_ingredients` | `recipe_id, ingredient_id, amount, preparation` | Clé composée ; recette supprimée en cascade, ingrédient référencé protégé ; quantité et cru/cuit. |
| `recipe_steps` | `id, recipe_id, position, kind, instruction, minutes` | ID ; unicité recette/position ; cascade recette ; durée absente distincte de zéro. |
| `recipe_photos` | `recipe_id, data` | Clé recette et cascade ; octets binaires, pas une URL à retélécharger. |
| `recipe_favorites` | `recipe_id` | Clé recette et cascade ; absence = non-favori. |
| `recipe_notes` | `recipe_id, rating, note` | Clé recette et cascade ; avis du foyer exclus de l'export léger. |
| `members` | `id, name, diet, avoided_ingredients` | ID ; nom unique ; goûts en texte JSON ; personne à table distincte d'un compte. |
| `proteins` | `id, name, category, amount, unit` | ID ; nom unique, quantité/catégorie ; références de repas protégées. |
| `meals` | `id, date, slot, location, occasion, people, recipe_id, title, leftover_of` | ID ; unicité jour/créneau ; recette supprimée = référence nulle ; source de restes protégée. |
| `meal_assignments` | `meal_id, member_id, protein_id, portions` | Clé repas/personne ; cascade repas/personne, supplément référencé protégé. |
| `meal_dishes` | `meal_id, member_id, recipe_id, portions, protein_id` | Clé repas/personne ; cascade repas/personne ; recette protégée, supplément facultatif. |
| `shopping_checks` | `week_start, name, unit` | Clé composée des coches calculées ; aucune normalisation destructive des libellés. |
| `shopping_manual` | `id, week_start, name, amount, unit, aisle, checked` | ID ; état coché indépendant d'une modification d'article ; édition conditionnelle/409. |
| `shopping_aisles` | `name, unit, aisle` | Clé composée ; l'ordre historique `rowid` intervient dans le choix d'une correction canonique. |
| `avoided_ingredients` | `name` | Clé texte ; préférence globale héritée, différente des goûts individuels. |
| `pantry` | `id, food_key, name, unit, amount, recorded_on, use_by, explicit_lot` | ID ; clé opaque unique avec séparateur NUL ou préfixe de lot ; date facultative et lots explicites. |
| `week_templates` | `id, name, source_start, meals_json, created_at` | ID ; nom unique ; texte JSON, date source et instant de création conservés. |

Les colonnes et les listes de tables sont figées par [postgres-contract.test.js](../postgres-contract.test.js). Les comportements de cascades, contraintes et limites sont aussi couverts par les suites de domaines existantes ; ne pas confondre une liste de colonnes avec un audit exhaustif de contraintes.

### Accès — 4 tables séparées du foyer

| Table | Colonnes à reprendre | Contrat |
| --- | --- | --- |
| `accounts` | `id, username, password, admin, active` | ID/identifiant unique ; mot de passe = hachage scrypt existant, jamais régénéré par migration. |
| `sessions` | `token, account_id, expires` | Jeton haché et expiration absolue en millisecondes ; cascade compte ; aucune prolongation. |
| `invitations` | `id, token, creator, expires` | Une invitation courante (`id=1`), jeton haché unique, créateur existant et autorisé requis. |
| `attempts` | `key, count, expires` | Limitations de tentatives et d'envoi ; compteurs/expirations valides conservés. |

L'import vers PostgreSQL reprendra ces quatre tables, mais **le téléchargement du foyer continuera à les exclure**. Même origine et nom de cookie, mêmes mots de passe ; les sessions déjà expirées/révoquées ne doivent pas redevenir valides. Les copies hors connexion du navigateur ne sont ni une base à importer ni une justification pour modifier les IDs.

## 2. Frontières synchrones et consommateurs

`node:sqlite` est importé directement par quatre modules de production : `server.js`, `accounts.js`, `backup-tools.js`, `restore.js`. `image-check.js` ouvre les deux schémas par leurs fonctions exportées ; le script de test Docker accède aussi directement aux fichiers. Lecture statique au début du lot : 162 lignes contenant `.prepare()`/`.exec()` dans le serveur, 40 dans les comptes, 5 dans les outils de sauvegarde, 13 dans la restauration, 1 dans le contrôle d'image. Ce sont des repères de localisation, **pas un nombre de requêtes distinctes ou de tâches**.

| Frontière | Appelants et résultat à préserver | Travail de portage |
| --- | --- | --- |
| `createDatabase`, `seed`, `seedProteins` | Démarrage, tests et contrôle d'image ; schéma/amorçage synchrones | Séparer initialisation neuve, migrations, lecture d'une source et import ; aucune création de données durant une simple analyse. |
| `recipes`, `saveRecipe` | Routes, catalogue, étapes, validations, calculs et tests directs | Requêtes asynchrones, ordre stable, transaction recette/enfants, DTO explicites. |
| `meals`, `validateMeal`, `upsertMeal`, `copyMealSet`, `calendar` | Planning, ICS, restes, menu composé, copies et semaines types | `validateMeal` lit aussi la base ; ne pas traiter toute validation comme pure. Même client transactionnel et refus sans écrasement. |
| `shoppingList`, `pantryStocks`, `reservePantry`, `pantry`, `pantryShopping`, `shoppingState` | Courses, aperçu, recommandations, synchronisations | Séparer calculs des lectures ; cohérence des instantanés, unités/arrondis et ordre de priorité. |
| `household`, `availablePantry`, `previewMenu`, `suggestions` | Foyer et classement ; lecture des personnes, plats, historique et stocks | Sorties identiques, règles de goûts/régimes/anti-gaspi inchangées ; pas de requêtes oubliées dans un callback de tri ou de `map`. |
| `createHandler`, `createApp`, lancement CLI | Serveur protégé, TLS et fermeture | Ouvrir avant écoute, propager `await`, fermer le pool ; ne pas transformer le harnais sans comptes en mode de production anonyme. |
| `openAccounts`, `createAccount`, `protectAccounts` | Connexion, sessions, invitations, droits, SMTP et CLI administrateur | Les fonctions internes `session`, `throttle`, `invitation` lisent/écrivent aussi ; revoir leur atomicité après les pauses asynchrones. |
| `checkBackup`, `restoreBackup`, `createRestore` | Téléchargement, aperçu/apply et CLI | Ancien SQLite validé sans modifier l'original ; nouveau format de données ; remplacement atomique et récupération. |
| `image-check.js`, healthcheck, scripts et CI | Build sans base ; test réel d'image et persistance | Pas de connexion au build, tests du vrai serveur après build ; ne pas affirmer PostgreSQL testé par le contrôle SQLite en mémoire. |

Les autres exports de `server.js` (`dateKey`, `addDays`, `isDateKey`, `validateRecipe`, `validateMember`, `validateProtein`, compatibilités des régimes) n'ouvrent pas de base. Les modules de normalisation, goûts, saisons, import internet, SMTP et TLS n'importent pas `node:sqlite` ; conserver leurs protections plutôt que les réécrire à l'occasion du portage.

### Inventaire des tests avant ce lot

54 fichiers `*.test.js` à la racine ; 30 appellent directement `createDatabase()` et `createApp()`, 4 `openAccounts()`, 2 `saveRecipe()`, 4 `shoppingList()`, 6 `suggestions()`. 25 utilisent `node:vm` pour des comportements clients ; les groupes se chevauchent. Les appels directs aux exports devront devenir attendables dans les tests concernés ; les fixtures SQL de préparation ne deviennent pas automatiquement compatibles avec PostgreSQL.

- Base éphémère en mémoire et harnais HTTP injecté : suites métier, planning, courses, placard, import, photos et préférences. Un succès de ce harnais seul ne prouve pas le contrôle d'accès.
- Comptes réellement branchés : `accounts.test.js`, `information.test.js`, `invitation-mail.test.js`, `tls.test.js`. Garder les refus, courses de concurrence, cookies et HTTPS.
- Copies de fichiers temporaires : sauvegarde/restauration, anciennes migrations, CLI et tests de persistance ; conserver leur isolation et refus d'écrasement. Aucun chemin de donnée réelle.
- VM/markup/navigateur : chargement de l'interface, erreurs réseau, doubles appuis et réponses obsolètes ; ne pas remplacer ces tests par des vérifications du pilote.
- Packaging : modules absents, ressources absentes, exclusions Docker, volumes et point d'entrée normal. L'ancienne commande `--network none` reste une preuve SQLite seulement.

## 3. Routes à reporter dans la matrice de parité

Le serveur expose les recettes via `GET /api/week` (pas via un nouveau `GET /api/recipes` à inventer). Les méthodes et variantes ci-dessous proviennent des branches actuelles du code ; elles restent à tester sur PostgreSQL lors de chaque tranche.

| Domaine | Routes et méthodes | Preuve existante à conserver |
| --- | --- | --- |
| Semaine/suggestions | `GET /api/week`, `GET /api/suggestions`, `POST /api/week/preview`, `POST /api/week/plan`, `POST /api/week/copy` | `server.test.js`, `preferences.test.js`, `menu-pantry.test.js`, `week-copy.test.js` ; aucune écriture à l'aperçu. |
| Semaines types | `GET/POST /api/week-templates`, `POST /api/week-templates/:id/apply`, `DELETE /api/week-templates/:id` | `week-templates.test.js`, `week-template-ui.test.js` ; nom, conflits et snapshots. |
| Repas | `POST/DELETE /api/meals`, `POST /api/meals/:id/placement`, `POST /api/meals/leftovers`, `GET /api/calendar.ics` | `dish-proteins.test.js`, `leftovers.test.js`, `notes-placement.test.js`, `restaurant-manual.test.js`. |
| Recettes | `POST /api/recipes`, `PUT/DELETE /api/recipes/:id`, `GET /api/recipes/:id/photo`, `PUT /api/recipes/:id/favorite`, `PUT /api/recipes/:id/notes` | `photos.test.js`, `favorites.test.js`, `recipe-notes.test.js`, `preparation.test.js`, `server.test.js`. |
| Import/export | `GET /api/recipes/export`, `POST /api/recipes/import-preview`, `POST /api/catalog/import` | `recipe-import.test.js`, `catalog-expansion.test.js`, `seasonal-catalog.test.js` ; aucune fusion de personnalisations. |
| Foyer | `GET /api/household`, `PUT /api/household/preferences`, `POST /api/members`, `PUT/DELETE /api/members/:id`, protéines aux mêmes méthodes/forme | `preferences.test.js`, `dish-proteins.test.js`, `member-profile.test.js`, `protein-form.test.js`. |
| Placard | `GET/POST /api/pantry`, `DELETE /api/pantry/:id` | `pantry.test.js`, `pantry-lots.test.js`, `pantry-dates.test.js` ; addition, dates, ambiguïtés et lots. |
| Courses | `GET /api/shopping`, `POST /api/shopping-checks`, `POST /api/shopping-checks/sync`, `POST /api/shopping-aisles`, `POST /api/shopping-manual`, `PUT/DELETE /api/shopping-manual/:id` | `shopping-sync.test.js`, `offline-shopping.test.js`, édition/409 dans `server.test.js`, VM de coches/rayons. |
| Connexion | `POST /api/account/login`, `/join`, `/logout`, `/logout-all`, `/password` ; `GET /api/account` | `accounts.test.js`, `tls.test.js` ; statut, origine, cookie et révocation. |
| Administration | `GET/POST /api/accounts`, `PUT /api/accounts/:id`, `POST/DELETE /api/accounts/invitation`, `POST /api/accounts/invitation/email`, `GET /api/accounts/certificate` | `accounts.test.js`, `invitation-mail.test.js`, `certificate-ui.test.js` ; rôle, invitation et certificat public. |
| Exploitation | `GET /api/health`, `GET /api/backup`, `POST /api/restore/preview`, `POST /api/restore/apply` | `backup.test.js`, `restore.test.js`, VM correspondantes, tests Docker/TLS ; accès administrateur sauf santé. |

Les pages `/`, `/login`, `/account` et les ressources statiques autorisées ne sont pas de nouvelles routes métier, mais leur protection, leurs types de contenu et les refus de méthodes non prises en charge restent à vérifier. Les commandes `accounts.js create-admin/reset-password`, `backup-tools.js check/restore`, le lancement `server.js` et `image-check.js` sont aussi des consommateurs à porter.

## 4. Écarts de représentation à traiter explicitement

**Clé de placard avec NUL :** `foodKey()` produit par exemple `pois chiches\0g`, actuellement stocké dans `pantry.food_key`. PostgreSQL refuse le caractère zéro dans ses champs texte. Choix retenu pour le schéma cible : `bytea` pour cette clé opaque, avec conversion UTF-8 aux frontières du dépôt ; ne pas supprimer/remplacer le séparateur ni changer la normalisation partagée avec les courses. Lire la source via `CAST(food_key AS BLOB)` pour comparer ses octets. Les clés `lot:…` passent par la même représentation. Tout NUL inattendu dans un autre champ texte est signalé au précontrôle, jamais retiré automatiquement. Sources : [texte PostgreSQL](https://www.postgresql.org/docs/18/datatype-character.html), [octets binaires](https://www.postgresql.org/docs/18/datatype-binary.html).

**Ordre historique des rayons :** `shoppingState()` lit `shopping_aisles ORDER BY rowid`, puis garde la dernière correction pour une même clé normalisée. Ajouter une colonne d'ordre interne à la cible, initialisée avec le `rowid` source et utilisée pour les nouvelles insertions ; garder le comportement d'un simple UPDATE qui ne déplace pas l'entrée. Ce champ technique n'apparaît pas dans l'API, mais fait partie de la sauvegarde cible. Ne pas substituer un tri par nom ou l'ordre physique PostgreSQL.

**Tris/casse/alias :** conserver le tri binaire actuel des titres/noms aux frontières concernées, distinct de `localeCompare('fr')` dans les classements et du `COLLATE NOCASE` des semaines types. Les tags sont déjà mis en minuscules par validation ; les goûts en JSON ne sont pas à réinterpréter. Garder les alias `sourceUrl`, `recipeId`, `leftoverOf`, etc. Les comparaisons JSON portent sur les valeurs publiques, pas les prototypes internes des objets du pilote SQLite.

**Types :** IDs au-delà de 32 bits, quantités décimales non arrondies dans une recette, octets de photo (zéros inclus), `null` distinct de zéro/absence, dates de repas sous forme de clés de jour indépendantes du fuseau et expirations absolues. Les arrondis des courses/du placard restent uniquement là où le métier les applique déjà. Aucune extension multi-foyers ni renumérotation autorisée.

## 5. Contrat de sauvegarde et sessions retenu pour la suite

Le bouton du foyer produira un **format de données**, pas un dump SQL : enveloppe `format: "manger-household-backup"`, `version: 1`, `schemaVersion` distinct du `PRAGMA user_version` historique, `createdAt` en UTC et `tables` contenant les tables de foyer autorisées. Chaque table contient des lignes à colonnes explicitement validées. IDs numériques sûrs, textes JSON conservés sans réécriture, binaires de photo et clé opaque encodés en base64 ; inclure l'ordre technique des rayons. Pas de donnée `auth`, SQL, rôle ou instruction exécutable dans cette enveloppe. Ce format sera implémenté et testé en 16–17, pas par ce lot.

Les anciennes sauvegardes SQLite restent acceptées après validation sur copie, sans exécuter le DDL du fichier. Aperçu et confirmation, limite de 32 Mio côté import, copie de récupération et transaction du foyer seul sont conservés. À taille identique de données, base64 et JSON peuvent rendre un fichier plus gros : mesurer les fixtures, expliquer le refus au-delà de la limite et documenter la procédure serveur, sans supprimer le bouton ou relever la limite silencieusement.

Le téléchargement complet opérateur conserve séparément `household` et `auth` par une procédure PostgreSQL de confiance. Les hachages de mots de passe, sessions et invitations sont transférés à l'identique avec expiration absolue, jamais prolongés. Pas de réinitialisation de mot de passe, d'inscription ou de changement d'origine obligatoire pour le seul changement de moteur.

## 6. Vérification et suite

Les cinq nouveaux tests de référence complètent les suites existantes : inventaire des tables/colonnes, recette/IDs/précision/photos/alias, clé opaque NUL, tri/casse/JSON, et lecture HTTP d'un repas à la frontière d'année avec dates/nulls. Une perte de `sourceUrl` injectée **en mémoire seulement** fait échouer le nouveau test ; aucun fichier applicatif n'a été modifié pour cette expérience. Les assertions sont des références SQLite à rejouer ou adapter sur PostgreSQL, pas une simulation de ce moteur.

Le premier passage complet inchangé a échoué au niveau du fichier `preferences.test.js`, sans détail de cause disponible au-delà de « test failed ». Ses deux tests passent isolément puis la même suite inchangée passe : 220 réussites, aucun ignoré, HTTPS inclus. Aucune correction du produit ou diminution d'assertion ne lui est attribuée. Les attentes initiales du nouveau test ont été précisées après lecture du code : tags déjà normalisés et comparaison de valeurs JSON, pas des prototypes du pilote. Après ajout : **225 tests réussis, aucun ignoré**, HTTPS inclus ; `node image-check.js` réussi, aucune modification applicative. Pas de benchmark, de test PostgreSQL ou de nouvelle validation téléphone/Ubuntu.

Le prérequis de la tâche 02 manque : aucun exécutable Docker/PostgreSQL trouvé dans le PATH ni aux emplacements usuels vérifiés de Docker Desktop/PostgreSQL. Ce contrôle ne prouve pas leur absence de tout le disque. Un environnement PostgreSQL de test isolé est nécessaire ; ne pas utiliser le serveur personnel Ubuntu pour contourner ce prérequis et ne pas valider la tâche 02 sur simple relecture d'un Compose.
