# Construction et déploiement Docker

**Instance déjà passée à PostgreSQL :** utiliser les deux fichiers Compose PostgreSQL, son fichier privé et son nom de projet explicite selon le [guide administrateur et sa maintenance](POSTGRESQL-ADMIN.md#9-mise-à-jour-et-entretien). Les commandes standard de ce document ciblent SQLite. La [bascule Linux après anciennes données de test est confirmée](POSTGRESQL-ADMIN.md#bascule-linux-confirmée--27-octobre-2026) : mêmes volumes du projet validé, ancien SQLite arrêté/conservé. La recette iPhone reste distincte et attendue.

## Socle PostgreSQL de développement — 22 octobre 2026

Le moteur de l'application reste SQLite et Compose/volumes sont inchangés. `pg@8.23.1` est maintenant une dépendance de production verrouillée : ne pas le retirer avec les outils de test. Les notices de dépendances dans `public/third-party-notices.txt` sont incluses par la règle publique existante, sans assouplir `.dockerignore`. `image-check.js` charge aussi récursivement `db/` et exige le module PostgreSQL et les notices, sans ouvrir de connexion PostgreSQL. Les tests retirent les modules/notices d'une copie temporaire et injectent un nouveau module `db/` pour vérifier le refus. Réinstallation npm de production et contrôle local réussis ; pas de construction Docker disponible localement, ces preuves ne remplacent pas le test Linux ci-dessous. Ne pas configurer `MANGER_STORAGE=postgres` : candidat incomplet refusé avant toute base/écoute jusqu'au portage métier et au lot de déploiement.

## Exclusions récursives corrigées après le premier essai Linux

Le 21 octobre 2026, les logs fournis par l'utilisateur confirment une construction de `a10857b` réussie, avec contrôle des modules dans l'image. Le test complet s'est ensuite arrêté sur `AssertionError: scripts` ; une inspection distincte a confirmé la présence de `scripts/check-docker-context.js`, pas d'un simple dossier vide. L'image n'est donc pas déclarée validée ni déployée par cet essai.

Les règles de dossier comme `**/scripts` ne suffisaient pas avec l'exception globale `!**/*.js` : un fichier JavaScript descendant pouvait être réinclus. Chaque dossier interdit possède maintenant aussi une exclusion explicite de ses descendants, par exemple `**/scripts/**`, placée après les autorisations. Même traitement pour données, clés, sauvegardes, dépendances locales, outils et dossiers cachés. Cette correction ne prouve pas qu'un secret a été embarqué précédemment ; seul l'outil de contrôle est confirmé par le retour utilisateur. Le contrôle strict de l'image n'est pas assoupli pour accepter ce dossier.

Une régression Node impose les exclusions de descendants ; le contexte Docker synthétique comprend le chemin exact de l'incident, des outils imbriqués et de faux fichiers JavaScript privés. Les motifs de construction suivent [la documentation Docker](https://docs.docker.com/build/concepts/context/#dockerignore-files) et le [moteur Moby](https://github.com/moby/patternmatcher/blob/main/patternmatcher.go). Le nouveau filtre doit encore être vérifié dans une image Linux reconstruite ; aucun Docker local ni accès de l'agent au serveur Ubuntu.

Après récupération du correctif, reconstruire puis retester sans remplacer le service courant : `docker compose build --pull manger`, puis `sh scripts/test-docker.sh manger:0.1.0`. Ne pas refaire le tag `manger:rollback-local` à partir de la nouvelle image non validée : conserver le retour arrière déjà créé. Ne pas lancer `up` tant que le test n'a pas réussi.

## Incident et correction — 21 octobre 2026

`catalog.js` charge `catalog-extra.js`, absent de l'ancienne liste `COPY` : une image pouvait être construite avec succès puis échouer au démarrage. L'utilisateur rapporte avoir rétabli son instance Ubuntu en ajoutant ce fichier et en reconstruisant. Ce retour ne constitue pas une validation de la nouvelle construction décrite ici.

Le Dockerfile copie maintenant le contexte filtré avec `COPY . .`, après l'installation des dépendances verrouillées (`npm ci --omit=dev --ignore-scripts`). Aucun module JavaScript n'est à ajouter individuellement à cette instruction, y compris dans un nouveau sous-dossier de code. `.dockerignore` refuse les fichiers par défaut, autorise les JavaScript, `public/`, les deux fichiers package et `LICENSE`, puis exclut les tests, outils de développement, dépendances locales, données, sauvegardes, fichiers cachés et matériel TLS. Les fichiers publics nécessaires, dont `information.html` et les icônes PNG/SVG, restent inclus.

Un nouveau type de ressource serveur autre que JavaScript doit être autorisé explicitement et testé. Ne placer aucun secret dans le code JavaScript ou les ressources publiques : un filtre de noms ne peut pas reconnaître une donnée privée cachée dans un fichier source autorisé. Les réglages privés arrivent à l'exécution ; jamais par `COPY` ou `ARG` de construction. L'overlay HTTPS monte seulement `tls/server` en lecture seule, sans intégrer les clés à l'image.

Le code et les dépendances appartiennent à root et sont lisibles, mais non modifiables par l'utilisateur applicatif `node`. Seul `/data` est préparé pour les écritures persistantes. Aucun compilateur, outil de test ou nouvelle dépendance npm n'est ajouté. Une étape multi-stage n'est pas nécessaire pour cette application sans compilation ; le cache npm est nettoyé dans sa couche d'installation. La base reste `node:24-alpine`, donc son tag est mobile : reconstruire avec `--pull` et tester chaque nouvelle image, sans prétendre obtenir un artefact identique bit à bit. Le générateur de certificats est du code source inclus ; la création des certificats reste une opération sur l'hôte avec OpenSSL, pas un service ajouté à l'image.

## Contrôles automatiques

1. **À chaque construction :** `RUN node image-check.js`, sous l'utilisateur `node`, charge les modules JavaScript à la racine et leurs dépendances, les pages assemblées et les icônes du manifeste. Les schémas des deux bases sont ouverts et contrôlés uniquement en mémoire. Un module ou fichier requis manquant interrompt le build ; aucune base du foyer n'est créée dans l'image. Les modules CLI gardent leurs effets de bord derrière `require.main === module`.
2. **Tests Node :** `npm test` comprend les régressions de packaging. Une copie temporaire du runtime réussit ; retirer `catalog-extra.js`, `public/food-names.js` ou `public/information.html` provoque un échec explicite. Les points de montage Compose et le refus de réautoriser tout le contexte sont également contrôlés. Ce n'est pas une émulation de Docker.
3. **Vrai contexte Docker :** `node scripts/check-docker-context.js` construit un petit contexte synthétique utilisant le vrai `.dockerignore`. Il exige l'inclusion de nouveaux modules racine/imbriqués et l'exclusion de faux secrets, bases, fichiers inconnus et outils. Aucun fichier privé réel n'est utilisé. Prérequis : Node 24 et Docker Linux accessibles.
4. **Vraie image :** `sh scripts/test-docker.sh manger:0.1.0` démarre la commande normale dans un nouveau conteneur sans réseau externe ni port publié, code en lecture seule, capacités retirées et contrôle de santé accéléré. Il teste santé, page de connexion, icône, refus des recettes sans connexion, utilisateur non-root et persistance/intégrité des **deux** bases après redémarrage. Le volume anonyme de test est distinct de `manger-data` ; le conteneur et son volume temporaire sont supprimés à la sortie. Aucun service Compose ou volume existant n'est visé.

Ces contrôles ne valident pas tous les parcours métier, l'état d'une base existante, le SMTP réel, les permissions de votre volume ou la confiance TLS de votre téléphone. Le test d'image est HTTP isolé ; les tests Node couvrent HTTPS avec une autorité temporaire. Ne pas désactiver la validation des certificats pour faire passer un test.

## Compose et protection des données

`compose.yaml` et `compose.https.yaml` restent **inchangés** : même service `manger`, volume nommé `manger-data:/data`, base `/data/manger.db` et `accounts.db` à côté. Le mode HTTPS ajoute un montage TLS en lecture seule et ne remplace pas `/data`. Les copies `recovery/` sont aussi dans ce volume. Aucune migration ni modification métier n'est introduite par ce correctif.

Conserver le dossier d'installation, le nom de projet et les fichiers Compose/override utilisés auparavant. Changer `-p`, `COMPOSE_PROJECT_NAME` ou le nom du dossier peut sélectionner un autre volume. Ne pas fixer un nouveau nom global de volume pour « corriger » cela. **Ne jamais utiliser `down -v`, `volume prune`, `system prune --volumes` ou supprimer un volume pendant une mise à jour.** Une reconstruction ne remplace pas une sauvegarde. Les deux bases et les fichiers de journal SQLite doivent être conservés ensemble ; ne pas copier seulement un fichier SQLite pendant que le serveur écrit.

## Mettre à jour une instance existante sur Linux

Toutes les commandes suivantes sont à exécuter par l'administrateur, pas par l'agent sur son serveur. Garder les mêmes options Compose qu'habituellement ; l'exemple suppose le dossier `~/services/manger`, projet par défaut et éventuel `compose.override.yaml` déjà présent.

### 1. Vérifier et sauvegarder avant modification

```sh
cd ~/services/manger
git status --short
docker compose ps
```

Si `Dockerfile` contient encore le correctif manuel, **arrêter ici et conserver/examiner sa différence** (`git diff -- Dockerfile`) avant de résoudre la mise à jour. Ne pas lancer `git reset --hard`, `git restore` ou écraser `.env`/l'override pour faire passer un pull. Ne pas publier leurs contenus privés.

Télécharger une sauvegarde du foyer depuis l'application. Elle n'inclut pas les accès. Pour une copie complète des deux bases et des journaux, prévoir une courte interruption puis copier **tout** `/data` depuis le conteneur arrêté :

```sh
backup_dir="$(mktemp -d ../manger-backup.XXXXXX)"
docker compose stop manger
docker compose cp manger:/data/. "$backup_dir/"
docker compose start manger
```

Vérifier la présence de `manger.db` et `accounts.db` dans ce dossier privé, conserver une copie protégée hors de ce serveur et sauvegarder séparément `.env`/TLS/override si nécessaire. Si une commande échoue, redémarrer l'ancien service si besoin et interrompre la mise à jour ; ne pas considérer la sauvegarde comme acquise. Aucune suppression de sauvegarde n'est incluse dans cette procédure.

### 2. Préparer et tester sans remplacer le service

Seulement avec un état Git propre et une sauvegarde vérifiée :

```sh
docker image tag "$(docker compose images -q manger)" manger:rollback-local
git pull --ff-only origin development
docker compose build --pull manger
sh scripts/test-docker.sh manger:0.1.0
```

Exécuter les commandes une par une et s'arrêter au premier échec. Le service courant conserve son ancienne image pendant la construction et le test. Pour contrôler aussi les exclusions avec de faux fichiers, exécuter `node scripts/check-docker-context.js` sur une machine disposant de Node 24 et Docker ; la CI le prévoit. La reconstruction forcée, rarement nécessaire, est `docker compose build --pull --no-cache manger` ; elle ne supprime aucun volume.

### 3. Remplacer seulement après réussite

```sh
docker compose up -d --no-build --wait --wait-timeout 60
docker compose ps
docker compose exec manger node healthcheck.js
```

Compose v2 récent est requis pour `--wait`. Vérifier ensuite connexion, recettes et planning depuis le téléphone, et les montages via `docker inspect --format '{{json .Mounts}}' "$(docker compose ps -q manger)"`. Ne pas partager les sorties privées de `docker compose config` : elles peuvent contenir les valeurs SMTP résolues. Pour valider la syntaxe sans les afficher, utiliser `docker compose config --quiet`.

### 4. Diagnostic et retour arrière

En cas de problème : `docker compose logs --tail=80 manger` et `docker compose ps`. Ne pas effacer les bases pour faire démarrer une image. Le Dockerfile conserve le healthcheck : `up -d` seul ne signifie pas que l'application est saine.

Pour ce correctif sans migration, l'image sauvegardée peut être remise en place :

```sh
docker image tag manger:rollback-local manger:0.1.0
docker compose up -d --no-build --wait --wait-timeout 60
```

Cela ne restaure pas les données. Pour une future version avec migration incompatible, revenir à une image ne suffit pas : prévoir aussi une restauration hors ligne sur une copie sauvegardée, sans écraser à l'aveugle le volume actif. Le tag de retour arrière doit correspondre à une image réellement fonctionnelle, pas à l'image défectueuse de l'incident.

## CI Codeberg préparée, pas activée par cette modification

Le dépôt n'avait pas de pipeline versionné. `.forgejo/workflows/docker.yaml` prépare désormais une matrice SQLite/PostgreSQL, puis un job dépendant avec audit npm, syntaxe Compose HTTP/HTTPS, test du contexte, construction et deux scénarios d'image. Déclenchement sur push `development`/`main` ou manuel ; pas de `pull_request_target`, exécution automatique de code de forks ou publication/déploiement. Checkout figé par SHA, sans conservation des identifiants. [Prérequis PostgreSQL et activation de l’étape 20](POSTGRESQL-CI.md).

Il faut activer Actions dans les paramètres Codeberg et fournir un runner Linux **dédié, jetable**, étiqueté `manger-docker`, avec Git, shell POSIX, Node 24+, npm, OpenSSL, Docker Engine et Compose. Pour les tests natifs, compte non root et binaires PostgreSQL 18.6 préinstallés, indiqués par la variable Actions `MANGER_TEST_PG_BIN` ; aucune base partagée. Le job doit pouvoir joindre les registres npm/Docker et la source de l'action checkout. L'accès au daemon Docker est privilégié : **ne jamais connecter ce runner au serveur de production, à ses volumes, à un socket Docker de production ou à ses secrets**. L'hôte du runner doit être préparé séparément ; aucune installation distante n'est effectuée ici.

Après un premier passage réussi, l'administrateur peut rendre ce statut obligatoire sur les branches protégées avant livraison. Aucune activation, protection de branche, exécution distante, image publiée ou certification de sécurité n'est revendiquée. Tant que cette CI n'est pas active, le test manuel de l'image reste une étape de livraison obligatoire.

## Preuve disponible et limites

Local Windows/Node 24 : régressions de modules manquants et absence de création de base persistante vérifiées ; tests complets et contrôles de syntaxe consignés dans [le suivi](ROADMAP.md). Docker CLI absent du PATH et de l'installation Docker Desktop habituelle : **aucune image construite ni test Docker/Compose réel exécuté par l'agent**. Les scripts et la CI restent à exécuter sous Linux. Aucune intervention sur Ubuntu, données réelles ou téléphone.

Sources techniques : [contexte et `.dockerignore`](https://docs.docker.com/build/concepts/context/#dockerignore-files), [multi-stage](https://docs.docker.com/build/building/multi-stage/), [identité du projet Compose](https://docs.docker.com/compose/how-tos/project-name/), [Actions sur Codeberg](https://docs.codeberg.org/ci/actions/), [accès Docker des runners Forgejo](https://forgejo.org/docs/latest/admin/actions/docker-access/). Consultées le 21 octobre 2026. Le refus de réautoriser `!**/` tient à la normalisation des motifs Docker : le slash final est supprimé, ce qui réautoriserait tout.

## Candidat du 26 octobre 2026 — étape 19a native

26 octobre 2026 : étapes 01–18 closes ; 19a (raccordement natif du candidat) réalisée, 19b Docker/Linux encore ouverte. 404 tests généraux et 238 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; 28 fichiers et 30 parents PostgreSQL. Commande sans binaires : 30 échecs explicites, zéro succès/ignoré, code 1 attendu. Modules/image et 36 documents/321 liens locaux vérifiés. Trois cycles de relecture réconciliés et parcours navigateur sur vrai PostgreSQL synthétique passé. Aucune donnée réelle déplacée ni publication.

Le lancement Docker standard reste SQLite. Ne pas transformer cette preuve native en validation d’une image ou d’un volume PostgreSQL ; 19b prépare des ressources propres sur le Linux de test désigné par l’utilisateur. Le flag candidat ne doit pas être ajouté à l’ancien Compose SQLite. [Détails et prérequis](POSTGRESQL-CANDIDAT.md).

## Résultat Linux 19b — 26 octobre 2026

Le scénario candidat a depuis été exécuté avec succès par l’administrateur : image `31ed51d`, script `b9a3ba4`, TLS et transfert, recréation des deux conteneurs avec persistance des tables/photos/session/identités, panne/reprise sans relance web, migration absente refusée et nettoyage propre. [Preuve synthétique et limites](POSTGRESQL-DOCKER.md#résultat-final-linux--étape-19-close). Étape 19 close ; cette réussite ne constitue ni une bascule de l’instance courante ni une exécution de la CI Codeberg.

## Profil administrateur HTTPS — préparation du 27 octobre

`compose.postgres.instance.yaml` se combine explicitement avec `compose.postgres.yaml`, dans un projet et dossier privés distincts de SQLite. Il ajoute HTTPS natif par secrets web, redémarrage persistant et bind local par défaut ; le service `instance` de sauvegarde/restauration reste réservé au profil `maintenance`. Les volumes et le moteur standards ne changent pas. Le [guide administrateur](POSTGRESQL-ADMIN.md) contient la procédure complète et ses prérequis, dont certificats permanents, copies figées et politique de sauvegarde privée. Le scénario synthétique `--admin-https` essaie ce profil avec un port local temporaire ; il ne vaut pas bascule réelle ou validation Safari.

Le résultat complet du scénario `36c5c8f` a été transmis par l’administrateur : [profil HTTPS et restauration réussis sur Docker Linux](POSTGRESQL-ADMIN.md#résultat-linux-du-profil-https--27-octobre-2026), ressources synthétiques nettoyées. L’exécution privée du guide et la bascule restent à faire ; aucune nouvelle construction ou intervention distante n’est nécessaire pour enregistrer cette preuve.
