# Architecture et maintenance

Lecture du dépôt le **10 octobre 2026**. Aucun changement de runtime, dépendance, schéma ou données n'est lié à ce regroupement documentaire.

## Résumé de l'architecture actuelle

Manger! est un **monolithe web auto-hébergé** : un seul processus Node.js sert l'interface et l'API. Il n'y a ni serveur frontend distinct ni service cloud obligatoire pour gérer les recettes, le planning et les courses.

- **Interface :** HTML, CSS et JavaScript dans `public/`, avec quatre onglets : Semaine, Recettes, Courses et Compte.
- **Serveur :** `server.js` reçoit les requêtes, valide les données et coordonne les modules métier ; `accounts.js` protège les accès au lancement normal.
- **Persistance :** SQLite conserve le foyer dans `manger.db` et les accès dans `accounts.db`. Les copies hors connexion restent séparées dans le navigateur.
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

`server.js` sert le HTML et les fichiers explicitement autorisés, valide les entrées et coordonne les calculs. Le HTML principal est lu au chargement du module : **redémarre le serveur après une modification de `public/index.html`**. Ouvrir ce fichier directement avec `file://` n'est pas un lancement de l'application : ses appels à l'API ont besoin du serveur.

## Repères dans le code

| Fichier | Responsabilité |
| --- | --- |
| [`server.js`](../server.js) | Schéma, migrations, recettes, repas, foyer, placard, courses, menus, API et serveur. |
| [`public/index.html`](../public/index.html) | Quatre onglets, présentation, formulaires, état client et protections réseau. |
| [`public/ui-icons.js`](../public/ui-icons.js) | Pictogrammes SVG des commandes et du compte, grille 24 × 24, trait 1,8 et couleur héritée. Table fermée, alias des anciennes commandes et noms inconnus ramenés à un cercle ; aucun HTML fourni par l'utilisateur dans les dessins. Chargé avant l'interface et servi par la liste explicite des fichiers publics. Sans dépendance ou requête externe ; logo et illustrations de recettes restent séparés. |
| [`accounts.js`](../accounts.js) | Base des accès, authentification, rôles, invitations, sessions et outils administrateur. |
| [`ingredients.js`](../ingredients.js), [`public/food-names.js`](../public/food-names.js) | Normalisation des aliments, unités, regroupements et vocabulaire anti-gaspi. |
| [`public/tastes.js`](../public/tastes.js), [`public/seasons.js`](../public/seasons.js) | Classement des goûts et repères saisonniers calculés localement : calendrier national avec compléments régionaux sourcés. Le filtre exige un fruit ou légume du mois non disponible toute l'année et aucun produit reconnu hors saison ; les tableaux explicatifs restent inchangés. L'interface fournit le mois courant de l'horloge et du fuseau local du navigateur, sans réglage manuel, et affiche le nombre de résultats près du filtre. Choix du calendrier dans le stockage du navigateur, sans migration SQLite ni géolocalisation. |
| [`catalog.js`](../catalog.js), [`recipe-import.js`](../recipe-import.js) | Catalogue de 38 recettes, textes originaux et quatre adaptations référencées via `sourceUrl`, import volontaire sans remplacer les titres présents ; téléchargement sécurisé et extraction des brouillons internet. |
| [`public/offline-shopping.js`](../public/offline-shopping.js), [`public/offline-recipes.js`](../public/offline-recipes.js), [`public/offline.html`](../public/offline.html), [`public/sw.js`](../public/sw.js) | Copies locales, page de secours et service worker limité à cette page. |
| [`restore.js`](../restore.js), [`backup-tools.js`](../backup-tools.js) | Restauration guidée avec récupération ; vérification et restauration vers un nouveau fichier. |
| [`invitation-mail.js`](../invitation-mail.js) | Configuration et envoi SMTP facultatif ; pas de fournisseur obligatoire. |
| [`tls.js`](../tls.js), [`create-local-tls.js`](../create-local-tls.js), [`healthcheck.js`](../healthcheck.js) | TLS natif, génération locale et contrôle de santé. |
| [`Dockerfile`](../Dockerfile), [`compose.yaml`](../compose.yaml), [`compose.https.yaml`](../compose.https.yaml) | Image locale Node Alpine, volume et modèle HTTPS facultatif. |

Cette carte ne demande pas de découper tout le serveur pour la modifier : fais le changement utile dans le code existant, avec des fonctions lisibles et des tests ciblés.

## Données et frontières

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
