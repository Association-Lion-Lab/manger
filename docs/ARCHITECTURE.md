# Architecture et maintenance

Lecture du dépôt le **10 octobre 2026**. Aucun changement de runtime, dépendance, schéma ou données n'est lié à ce regroupement documentaire.

## Résumé de l'architecture actuelle

Manger! est un **monolithe web auto-hébergé** : un seul processus Node.js sert l'interface et l'API. Il n'y a ni serveur frontend distinct ni service cloud obligatoire pour gérer les recettes, le planning et les courses.

- **Interface :** HTML, CSS et JavaScript dans `public/`, avec quatre onglets : Semaine, Recettes, Courses et Compte.
- **Serveur :** `server.js` reçoit les requêtes, valide les données et coordonne les modules métier ; `accounts.js` protège les accès au lancement normal.
- **Persistance :** SQLite conserve le foyer dans `manger.db` et les accès dans `accounts.db`. Les copies hors connexion restent séparées dans le navigateur.
- **Migration en développement (25 octobre 2026) :** `db/postgres.js` fournit une frontière asynchrone isolée, sans ouverture à l'import ; schéma et connexions testés sur PostgreSQL jetable. [Connexion/sessions](POSTGRESQL-AUTH.md), [invitations/administration et service de récupération](POSTGRESQL-ACCES.md), [personnes/goûts/protéines](POSTGRESQL-FOYER.md), [recettes](POSTGRESQL-RECETTES.md), [repas et ICS](POSTGRESQL-REPAS.md) et [semaines/déplacements/restes](POSTGRESQL-SEMAINES.md) utilisent les dépôts communs SQLite/PostgreSQL, candidat injecté uniquement dans les tests. `MANGER_STORAGE` absent/`sqlite` conserve le lancement normal ; `postgres` est explicitement refusé avant ouverture des bases tant que le portage métier est incomplet, CLI standard comprise. [Contrat de connexion](POSTGRESQL-CONNEXION.md), aucune bascule de déploiement.
- **Déploiement :** Node.js directement ou Docker Compose avec un volume persistant ; HTTPS natif facultatif. L'import internet et le SMTP contactent des services externes uniquement lorsqu'ils sont utilisés. Les restaurants sont saisis manuellement, sans appel externe.

### Vue d'ensemble

```text
Navigateur — interface public/ et copies locales facultatives
    |
    | HTTP(S) : pages, fichiers autorisés et API JSON
    v
Serveur Node.js — un seul processus
    |-- Contrôle des accès : accounts.js <--> accounts.db
    |-- Routes et calculs métier : server.js + modules
    |       `-- Données du foyer <--> manger.db
    `-- Appels externes facultatifs : import, SMTP
```

Les deux fichiers SQLite sont stockés côté serveur. Le volume Docker les conserve lors d'une reconstruction de l'image ; publier le dépôt ne publie pas ces données. Le détail des responsabilités, des flux et des limites figure ci-dessous.

## Socle

Manger! est une application web avec **serveur Node.js 24+**, API HTTP/HTTPS native et SQLite via `node:sqlite`. L'interface utilise HTML, CSS et JavaScript sans framework ni compilation client. `npm ci --ignore-scripts` installe Nodemailer à la version verrouillée ; son utilisation pour envoyer des invitations reste optionnelle.

`server.js` sert le HTML et les fichiers explicitement autorisés, valide les entrées et coordonne les calculs. `public/information.html` contient le même bloc statique « Confidentialité et licences » inséré côté serveur dans le HTML principal et dans la page des comptes, à la place d'un marqueur fixe. Il n'est pas exposé par une route de fichiers générique et n'inclut aucune donnée d'instance ni script. Les pages restent des buffers UTF-8 avec longueur correcte. Ces contenus sont lus au chargement des modules : **redémarre le serveur après une modification de `public/index.html`, `public/accounts.html` ou `public/information.html`**. Ouvrir les fichiers directement avec `file://` ne lance pas l'application ni n'assemble cette rubrique : ses appels à l'API ont besoin du serveur.

## Repères dans le code

| Fichier | Responsabilité |
| --- | --- |
| [`server.js`](../server.js) | Schéma, migrations, recettes, repas, foyer, placard, courses, menus, API et serveur. |
| [`public/index.html`](../public/index.html) | Quatre onglets, présentation, formulaires, état client et protections réseau. |
| [`public/ui-icons.js`](../public/ui-icons.js) | Pictogrammes SVG des commandes et du compte, grille 24 × 24, trait 1,8 et couleur héritée. Table fermée, alias des anciennes commandes et noms inconnus ramenés à un cercle ; aucun HTML fourni par l'utilisateur dans les dessins. Chargé avant l'interface et servi par la liste explicite des fichiers publics. Sans dépendance ou requête externe ; logo et illustrations de recettes restent séparés. |
| [`accounts.js`](../accounts.js) | Base des accès, authentification, rôles, invitations, sessions et outils administrateur. |
| [`db/auth.js`](../db/auth.js), [`db/auth-sqlite.js`](../db/auth-sqlite.js) | Dépôts nommés pour connexion/sessions, invitations, administration et réservation SMTP ; récupération locale atomique appelée par `accountCommand`. Candidat PostgreSQL testé par injection isolée seulement ; aucune requête SQLite dans le middleware HTTP. |
| [`ingredients.js`](../ingredients.js), [`public/food-names.js`](../public/food-names.js) | Normalisation des aliments, unités, regroupements et vocabulaire anti-gaspi. |
| [`household.js`](../household.js), [`household-http.js`](../household-http.js), [`db/household-sqlite.js`](../db/household-sqlite.js), [`db/household.js`](../db/household.js) | Validation et routes de personnes/préférences/protéines partagées ; dépôt SQLite synchrone pour les calculs existants et dépôt PostgreSQL transactionnel isolé. Harnais candidat fermé aux autres parcours, sans repli SQLite. |
| [`recipe.js`](../recipe.js), [`recipe-http.js`](../recipe-http.js), [`db/recipes-sqlite.js`](../db/recipes-sqlite.js), [`db/recipes.js`](../db/recipes.js) | Validation et routes d’écriture communes, lecture/édition/retrait atomiques ; DTO préparé avant COMMIT, exports SQLite synchrones conservés. Lecture photo binaire, favoris/avis transactionnels et import du catalogue entier sous le même verrou foyer, sans écraser les titres présents. |
| [`recipe-extras-http.js`](../recipe-extras-http.js), [`recipe-preview.js`](../recipe-preview.js) | Six routes communes photo/favoris/avis/export/catalogue/aperçu ; corps bornés, IDs sûrs et erreurs internes privées. Aperçu sans écriture ni verrou SQL pendant le réseau, un téléchargement à la fois par handler ; protections du downloader existant conservées. L'enregistrement final du brouillon reste volontaire. |
| [`meal.js`](../meal.js), [`meal-http.js`](../meal-http.js), [`db/meals-sqlite.js`](../db/meals-sqlite.js), [`db/meals.js`](../db/meals.js) | Validation de repas et de références, ajout/remplacement/retrait atomiques, lecture hebdomadaire cohérente et trois routes communes avec ICS. Verrou foyer avant revalidation PostgreSQL ; précondition de valeur d'ID facultative, erreurs privées. Wrappers synchrones de lecture/validation conservés pour les calculs ; anciens helpers de copie remplacés par le dépôt de planification ci-dessous, sans transaction imbriquée. Pas de lancement normal PostgreSQL. |
| [`dates.js`](../dates.js) | Helpers de dates sans fuseau extraits du serveur pour les règles et le calendrier partagés ; validation explicite des jours invalides et passage d'année. Aucun horaire de repas ajouté. |
| [`planning.js`](../planning.js), [`planning-http.js`](../planning-http.js), [`db/planning-sqlite.js`](../db/planning-sqlite.js), [`db/planning-postgres.js`](../db/planning-postgres.js) | Lots de menus, copies de semaines et modèles, déplacements et restes ; règles pures et SQL natif, enregistrement interne du repas réutilisé. Source/snapshot/créneaux/capacité revalidés sous transaction et verrou foyer ; remappage local des liens en second passage, erreurs internes privées. Callbacks SQLite synchrones ; même client transactionnel PostgreSQL. Les calculs de suggestions/aperçu et GET agrégé restent à porter. |
| [`public/tastes.js`](../public/tastes.js), [`public/seasons.js`](../public/seasons.js) | Classement des goûts et repères saisonniers calculés localement : calendrier national avec compléments régionaux sourcés. Le filtre exige un fruit ou légume du mois non disponible toute l'année et aucun produit reconnu hors saison ; les tableaux explicatifs restent inchangés. L'interface fournit le mois courant de l'horloge et du fuseau local du navigateur, sans réglage manuel, et affiche le nombre de résultats près du filtre. Choix du calendrier dans le stockage du navigateur, sans migration SQLite ni géolocalisation. |
| [`catalog.js`](../catalog.js), [`catalog-extra.js`](../catalog-extra.js), [`recipe-import.js`](../recipe-import.js) | Catalogue de 100 recettes (38 antérieures et 62 nouvelles), textes originaux et quatre adaptations référencées via `sourceUrl`, import volontaire sans remplacer les titres présents. Constructeur commun, états cru/cuit explicites pour le nouveau lot ; téléchargement sécurisé et extraction des brouillons internet séparés du catalogue local. |
| [`public/offline-shopping.js`](../public/offline-shopping.js), [`public/offline-recipes.js`](../public/offline-recipes.js), [`public/offline.html`](../public/offline.html), [`public/sw.js`](../public/sw.js) | Copies locales, page de secours et service worker limité à cette page. |
| [`restore.js`](../restore.js), [`backup-tools.js`](../backup-tools.js) | Restauration guidée avec récupération ; vérification et restauration vers un nouveau fichier. |
| [`invitation-mail.js`](../invitation-mail.js) | Configuration et envoi SMTP facultatif ; pas de fournisseur obligatoire. |
| [`tls.js`](../tls.js), [`create-local-tls.js`](../create-local-tls.js), [`healthcheck.js`](../healthcheck.js) | TLS natif, génération locale et contrôle de santé. |
| [`Dockerfile`](../Dockerfile), [`compose.yaml`](../compose.yaml), [`compose.https.yaml`](../compose.https.yaml) | Image locale Node Alpine, volume et modèle HTTPS facultatif. |
| [`image-check.js`](../image-check.js), [`docker.test.js`](../docker.test.js) | Contrôle des modules, pages/icônes et schémas SQLite en mémoire ; régressions de packaging et conservation des points de montage. |

Depuis le 21 octobre 2026, le Dockerfile utilise `COPY . .` avec un contexte autorisé explicitement dans `.dockerignore`, au lieu d'une liste de modules. Nouveau JavaScript inclus automatiquement ; fichiers privés et outils/tests exclus, dépendances réinstallées depuis le verrou npm. Le build exécute le contrôle sous `node`, sans base persistante. Le code est propriété de root et `/data` reste inscriptible. Les scripts de test du contexte et de l'image ainsi que le pipeline Forgejo restent hors de l'image. Voir [Docker : contrat, sécurité et preuve disponible](DOCKER.md) ; aucun changement de Compose, schéma ou fonctionnalité.

Cette carte ne demande pas de découper tout le serveur pour la modifier : fais le changement utile dans le code existant, avec des fonctions lisibles et des tests ciblés.

## Données et frontières

Migration PostgreSQL en préparation après validation du plan le 22 octobre : [inventaire des 22 tables, consommateurs et contrats](POSTGRESQL-CONTRATS.md). Le runtime reste SQLite. Un [PostgreSQL local jetable de test](POSTGRESQL-TEST.md) est disponible sous Windows, avec `pg@8.23.1` verrouillé et désormais en production pour la [frontière asynchrone](POSTGRESQL-CONNEXION.md) ; aucune connexion à l'import. La commande dédiée crée puis retire ses propres clusters, sans service système ni connexion à une base existante. `.test-tools/` et `test-support/` ne sont pas distribués dans l'image applicative. Le [schéma cible et l'exécuteur administratif](POSTGRESQL-SCHEMA.md) restent séparés dans `db/`, sans dépendance au pilote à l'import, sans amorçage et sans appel depuis `server.js`. Versionnement privé, deux schémas métier et rôles distincts réellement testés ; [connexion/sessions](POSTGRESQL-AUTH.md), [invitations/administration](POSTGRESQL-ACCES.md), [personnes/goûts/protéines](POSTGRESQL-FOYER.md), [recettes](POSTGRESQL-RECETTES.md), [repas et ICS](POSTGRESQL-REPAS.md) et [semaines/déplacements/restes](POSTGRESQL-SEMAINES.md) testés en HTTP commun. Les autres données du foyer restent à porter. Service de commande locale PostgreSQL injectable testé ; raccordement CLI au lancement complet en 19. Le séparateur NUL et l'ordre historique des rayons sont pris en compte dans le DDL, mais leurs conversions/lectures restent à porter avec les sauvegardes et appels synchrones.

`MANGER_DB` choisit la base du foyer ; par défaut `data/manger.db`, ou `/data/manger.db` dans Docker. Elle contient recettes, ingrédients/étapes, photos, avis/favoris, personnes/protéines, repas/répartitions/restes, courses, corrections de rayons, placard et semaines types. Le schéma actuel est **4**, avec migrations à l'ouverture.

`accounts.db` est un fichier distinct à côté de cette base. Il contient accès, sessions, invitations et compteurs de tentatives. La sauvegarde du foyer et sa restauration **n'incluent pas les comptes**. Le navigateur conserve séparément ses réglages et les copies hors connexion consenties ; celles-ci ne sont pas une deuxième base serveur synchronisée.

Les répertoires `data/`, `tls/`, `node_modules/`, le fichier `.env`, les clés privées et `compose.override.yaml` sont locaux/ignorés. Ne les déplace pas ni ne les publie pour documenter le projet. Les copies de récupération de restauration sont dans `recovery/`, à côté de la base du foyer.

## Flux principaux

Pour planifier, le client envoie les recettes, personnes, portions et protéines choisies. Le serveur vérifie date, créneau, régime, références et contraintes de restes avant d'enregistrer. Les courses sont dérivées du planning, y compris les suppléments et portions à conserver ; les réservations du placard se font chronologiquement.

`previewMenu()` et `suggestions()` classent les recettes selon les contraintes et estimations locales. Un aperçu n'enregistre pas de repas. La confirmation d'un menu et la copie d'une semaine refusent les conflits sans remplacer les créneaux occupés. Les goûts sont un classement, alors que régime et durée constituent les contraintes strictes du parcours.

`shoppingState()` rassemble les courses calculées et manuelles ; `shoppingList()` seul ne représente pas toute la liste éditable. Les variantes alimentaires et unités passent par les fonctions communes. Réutilise ces points d'entrée pour éviter un calcul différent entre les courses et les propositions.

Pour une écriture client, distingue refus, résultat perdu et confirmation suivie d'un échec de lecture. Capture l'identité concernée, protège les doubles envois, conserve la saisie en erreur et ignore les réponses devenues obsolètes. Ne programme pas un renvoi automatique d'une mutation sans mécanisme serveur adapté.

## Repères API

| Domaine | Points d'entrée principaux |
| --- | --- |
| Planning | `GET /api/week`, `POST/DELETE /api/meals`, `POST /api/meals/leftovers`, `POST /api/meals/:id/placement`. |
| Suggestions et semaines | `GET /api/suggestions`, `POST /api/week/preview`, `/api/week/plan`, `/api/week/copy`, `/api/week-templates` et application d'un modèle. |
| Recettes | `POST /api/recipes`, `PUT/DELETE /api/recipes/:id`, photo, favori et notes ; `/api/recipes/import-preview`, `/api/recipes/export`, `/api/catalog/import`. |
| Foyer et stocks | `/api/household`, préférences, `/api/members`, `/api/proteins`, `/api/pantry` et modification/retrait par identifiant. |
| Courses | `GET /api/shopping`, `/api/shopping-checks`, `/api/shopping-checks/sync`, `/api/shopping-manual`, `/api/shopping-aisles`. |
| Sorties | Saisie de « Nom du restaurant » et sauvegarde par `/api/meals`, sans API géographique. Anciennes routes de recherche supprimées (404 sur le harnais authentifié ou de cœur). |
| Accès | `/api/account`, connexion/déconnexion/mot de passe, `/api/accounts`, invitations et envoi SMTP facultatif ; `GET /api/accounts/certificate`, certificat public DER pour l’administrateur en HTTPS local. |
| Exploitation | `/api/health`, `/api/calendar.ics`, `/api/backup`, `/api/restore/preview`, `/api/restore/apply`. |

Il s'agit de repères, pas d'un contrat d'API externe exhaustif : les méthodes, payloads, en-têtes, limites et statuts se vérifient dans les routes et leurs tests avant utilisation.

## Sécurité et services optionnels

Le lancement normal ouvre les comptes et protège les requêtes. Les mutations exigent l'origine de l'instance ; mots de passe hachés avec scrypt, sessions hachées en base, cookie HttpOnly/SameSite Strict et Secure sous HTTPS, expiration et limitation des tentatives. Sauvegarde, restauration et administration des accès sont réservées à l'administrateur. Il reste un seul foyer partagé.

Les tests de cœur peuvent injecter une base à `createApp()` sans comptes : **ce chemin est un harnais de test isolé, pas une configuration de production anonyme**. Les tests d'accès utilisent la protection des comptes. Ne généralise pas une réussite du premier harnais à la sécurité du lancement normal.

L'import internet vérifie les URL, adresses publiques IPv4, résolutions et redirections ; épinglage DNS, limites de taille/durée et absence d'exécution JavaScript réduisent le risque SSRF. Ne désactive pas ces contrôles pour accepter un site récalcitrant. Le SMTP reste volontaire ; consulter le guide pour les données transmises. Le parcours restaurant n'envoie aucune position et ne charge plus de ressource cartographique externe ; CSP images limitée à self et data.

## Vérifier une modification

Le dépôt canonique est [Codeberg LION_LAB/manger](https://codeberg.org/LION_LAB/manger). Les branches `main` et `development` existent : le travail actuel et les mises à jour de test sont sur `development`. La présence de `main` ne garantit pas qu'elle contient les derniers lots ; ne fusionne pas une version non validée implicitement. Git publie le code et les documents, pas le volume Docker ou les réglages privés du serveur.

1. Lis les appels, tests et données concernés ; identifie le risque avant d'éditer.
2. Ajoute un test ciblé pour la nouvelle logique, puis lance `npm test` depuis la racine.
3. Pour l'interface, contrôle le parcours réel, le clavier, 320/390/760 px, les thèmes et le texte agrandi sur une base isolée.
4. Actualise les pages de `docs/` concernées et explique les choix/blocages dans `DECISIONS.md` ; note les validations réelles dans `ROADMAP.md`.
5. Vérifie les liens et `git diff --check` ; ne publie ni secrets ni données locales, et ne prétends pas avoir validé un appareil distant avec un test local.

Ne démarre pas plusieurs serveurs sur des ports successifs : contrôle d'abord le processus et l'écoute existants. Les migrations, restaurations et tests destructifs doivent utiliser une base dédiée, jamais le foyer réel. Les détails d'installation et de récupération sont dans [le guide](GUIDE.md) et [HTTPS](HTTPS.md).

## Incidents déjà rencontrés

- **Page ouverte avec `file://`, erreur de chargement :** l'API n'est pas servie par le fichier. Lance le serveur et ouvre son URL HTTP/HTTPS ; ne tente pas de supprimer les protections du navigateur.
- **Git « not a git repository » :** le terminal n'est pas dans le dépôt. Place-toi à sa racine avant status, pull ou push. Une erreur d'appartenance du dossier nécessite de vérifier le propriétaire puis, si ce seul dépôt est bien de confiance, d'autoriser ce chemin précis ; jamais tous les dossiers par un joker.
- **Clone Codeberg refusé :** authentification invalide ou dépôt non accessible ; ce n'est pas une erreur Compose. Vérifie les droits et le moyen d'authentification avant de lancer les commandes suivantes. Ne publie pas de jeton ou de clé privée dans la documentation.
- **Géolocalisation expirée ou recherche externe en échec :** une permission autorisée ne garantit pas une position obtenue ou un service disponible. Recherche par commune/code postal ou saisie manuelle en repli. Carte intégrée depuis le 14 octobre, mais son fond OSM reste externe et non disponible hors connexion ; liste ouverte en cas de panne du fond.
- **Icône iPhone absente ou alerte TLS :** vérifier l'URL, la configuration HTTPS, le certificat public installé et sa confiance complète. Accepter une alerte une fois ne constitue pas une confiance de l'autorité ; suivre [le guide HTTPS](HTTPS.md), puis recréer le raccourci si nécessaire.

## Portage du stock et des calculs (26 octobre 2026)

calculations.js contient les règles pures et les deux chemins d'arrondi. db/calculation-items.js fournit une requête métier fixe sur SQLite ou le namespace household ; db/calculations-sqlite.js et db/calculations.js chargent la photographie cohérente. pantry.js contrôle les modifications ; db/pantry-sqlite.js et db/pantry.js les engagent sous transaction/verrou. calculation-http.js est commun aux deux moteurs, branché au serveur SQLite normal et au harnais PostgreSQL isolé. Les exports synchrones historiques shoppingList/suggestions restent utilisables. [Contrat](POSTGRESQL-CALCULS.md).

## Portage des courses (26 octobre 2026)

shopping.js conserve DTO et préconditions, db/shopping-sqlite.js et db/shopping.js exécutent transactions et écritures conditionnelles. shopping-http.js porte GET semaine/courses et les mutations. db/repositories.js construit les dépôts PostgreSQL d'une même base ; createBusinessHandler les compose dans le harnais protégé. Pas de mélange SQLite/PostgreSQL ni activation normale. [Contrat](POSTGRESQL-COURSES.md).

## Analyse administrative des données (26 octobre 2026)

migration-format.js fixe types/colonnes/uniques/références des 22 tables, y compris sort_order issu du rowid. migration-source.js lit des sources SQLite arrêtées, reconstruit un schéma de confiance en temporaire et ne rend public que le rapport. Les données internes sont privées. [Contrat](POSTGRESQL-SOURCES.md).
