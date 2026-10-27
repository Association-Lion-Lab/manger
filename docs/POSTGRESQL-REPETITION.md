# Répétition de migration — préparation 21a, validation finale distincte

26 octobre 2026 : l’activation CI 20b reste ouverte faute d’exécuteur configuré. La demande de poursuivre permet de préparer la répétition sur des fixtures synthétiques locales ; elle ne ferme pas ce prérequis et n’autorise pas une bascule réelle. Aucune donnée ou volume du serveur personnel n’est utilisé par cette tranche.

## Contrat avant implémentation

1. Analyser deux copies SQLite synthétiques arrêtées ; relever leurs empreintes et leur taille, puis vérifier qu’elles restent inchangées après chaque parcours. Une source invalide est refusée avant import ; une panne SQL pendant l’import laisse les tables métier vides et la cible pending non réutilisable.
2. Importer les 22 tables vers une autre cible neuve, puis simuler un refus de démarrage du candidat sans mutation métier. Utiliser le runtime PostgreSQL et les outils de sauvegarde existants, sans nouveau moteur ou protocole.
3. Avant nouvelle écriture, contrôler une archive complète et démontrer que les copies SQLite restent utilisables par le serveur normal avec les comptes existants. Ce test natif ne vaut pas changement d’un volume Docker ou réouverture d’un service réel.
4. Après une nouvelle écriture PostgreSQL, la vérification contre l’archive antérieure doit refuser la correspondance. Produire et vérifier une archive récente, restaurer celle-ci vers une troisième cible de secours vide et vérifier la dernière valeur par HTTP. Aucun retour inverse automatique PostgreSQL → SQLite n’est annoncé.
5. Mesurer durées des phases, octets des sources, taille PostgreSQL et archives synthétiques. Ces nombres décrivent uniquement la fixture et la machine du test ; ils ne sont pas une estimation du temps d’arrêt ou de l’espace du serveur personnel.

La commande native est raccordée à `npm run test:postgres` et donc à la CI préparée, sans ignorer un PostgreSQL absent. Elle utilise trois clusters privés et uniquement les fichiers créés par ses fixtures. La procédure privée et la preuve Linux du guide final restent distinctes ; tant que 20b et les répétitions requises ne sont pas attestées, l’étape 21 n’est pas close.

## Parcours testé

`test-support/postgres-rehearsal.integration.cjs` réutilise l’analyse stricte, l’import transactionnel, le runtime candidat et `postgres-instance.js`. Une division par zéro est injectée après la vraie insertion d’une photo : la transaction est réellement annulée, les 22 tables métier restent vides et l’état pending interdit un nouvel import sur cette cible. Les empreintes SHA-256 des deux fichiers sources sont comparées après les pannes ; des copies séparées sont ouvertes par le serveur SQLite et interrogées par HTTP avec une session existante.

Le refus de démarrage exige le code `MANGER_POSTGRES_NOT_READY`, pas une exception quelconque. Une fois la cible saine, une archive complète est vérifiée. Après un nouvel avis écrit par HTTP, `verifyInstance` doit refuser l’ancienne archive avec `MANGER_INSTANCE_MISMATCH`. Une nouvelle archive est alors créée et vérifiée ; elle est restaurée vers un autre cluster neuf, contrôlée fermé, puis ouverte explicitement. La session et le dernier avis sont relus par le vrai serveur candidat.

Il s’agit d’un **refus de correspondance**, à respecter dans la procédure administrateur, pas d’un mécanisme capable d’empêcher un administrateur de relancer manuellement une ancienne installation. Ni fusion inverse, ni transfert PostgreSQL → SQLite, ni commutation de volume Docker n’est implémenté par cette tranche. L’ancienne archive reste une archive valide de son époque, mais elle ne contient pas la nouvelle écriture.

## Mesures de la fixture Windows native

Exemple issu de la relance complète locale du 26 octobre, hors nettoyage des clusters : 27,7 secondes pour le scénario, dont 0,2 seconde d’import et 0,7 seconde de restauration. L’ouverture du runtime seul a pris 0,2 seconde, avant son écoute HTTP. Ces durées comprennent du provisionnement et ne mesurent pas l’indisponibilité d’une vraie instance.

| Mesure | Octets constatés |
| --- | ---: |
| Deux copies SQLite | 176 128 |
| Archive initiale et manifeste | 65 566 |
| Archive récente et manifeste | 65 585 |
| Base PostgreSQL de test | 9 672 383 |

Le catalogue est minuscule et synthétique. La taille PostgreSQL ne comprend pas tout le cluster, les WAL, images Docker, copies intermédiaires ou l’espace temporaire du système. Ne pas dimensionner le serveur ou annoncer un temps de maintenance à partir de ces valeurs. Une répétition privée doit mesurer son propre jeu de données et son pic d’espace.

## Répétition privée par l’administrateur — procédure préparatoire

1. Garder l’image et le Compose SQLite fonctionnels. Arrêter tous les écrivains avant de copier les **deux bases complètes** et vérifier les copies ; ne jamais copier seulement `manger.db` en oubliant `accounts.db` ou des journaux SQLite actifs. La préparation des rôles, secrets et certificats reste hors de la sauvegarde du foyer.
2. Conserver cette copie arrêtée comme référence privée, jamais dans Git, la CI ou les messages. Pour une répétition séparée, l’instance courante peut ensuite reprendre tandis que les copies restent figées ; ces copies ne seront plus une source finale à jour pour la bascule.
3. Utiliser une cible PostgreSQL distincte, neuve et avec TLS vérifié. Analyser puis importer les copies ; mesurer la durée, la taille de toute l’empreinte temporaire et vérifier les 22 tables, comptes, sessions et photos. Un état pending ou incertain impose un contrôle, jamais un nouvel import automatique sur la même cible.
4. Tant qu’aucune nouvelle écriture n’a été acceptée, garder les écrivains arrêtés pendant le contrôle d’égalité et la décision de retour. Les anciens fichiers doivent rester inchangés et réellement utilisables ; ne pas faire fonctionner deux origines d’écriture concurrentes. Un simple changement de tag ou de volume après réouverture n’est pas un retour sans perte.
5. Après la première nouvelle écriture, archiver l’état PostgreSQL récent et conserver l’ancienne source séparément. Vérifier puis restaurer l’archive récente sur une cible de secours vide. Si l’ancienne référence ne correspond plus, refuser le retour annoncé sans perte ; reprise vers ce secours récent ou décision explicite de l’administrateur sur les données à récupérer.

Cette procédure n’est pas encore le guide Linux exécutable de l’étape 22. Ses commandes exactes et le retour par les volumes doivent être répétés par l’administrateur avant une vraie bascule. Le test de comparaison doit se faire sans écrivain concurrent : un contrôle ponctuel ne protège pas d’une écriture arrivée immédiatement après.

## Vérifications et limites

Le premier essai de mesure disque a dépassé le délai d’une seconde de la connexion de fixture. La mesure utilise désormais le pool administratif déjà existant, sans augmenter les délais de l’application ni ceux des assertions métier. Deux cycles de relecture : refus de démarrage trop général corrigé en code d’erreur précis ; deuxième sans nouveau constat. Aucun outil de relecture externe, aucune donnée réelle ou intervention sur le Linux personnel.

Résultat final : **407 tests généraux et 243 tests PostgreSQL réussis, aucun échec ou ignoré**, HTTPS inclus. La commande PostgreSQL contient 29 fichiers et 31 parents ; sans binaires, 31 échecs explicites, zéro succès/ignoré et code 1 attendu. Le premier passage complet avait échoué à la synchronisation disque d’un initdb temporaire ; après réussite du fichier isolé, la suite complète relancée seule passe, sans seuil modifié. Les détails restent dans les décisions.

La préparation native 21a est réalisée ; les mesures ci-dessus restent un exemple de fixture, pas une mesure du serveur de l’utilisateur. Les étapes 20b, 21 finale, 22 et 23 restent ouvertes jusqu’aux preuves correspondantes. Arrêt demandé pour la soirée : aucun lancement en arrière-plan ou reprise automatique ; prochaine reprise depuis ce point.

## Reprise du 27 octobre — contrôle Docker du retour aux copies SQLite

Le scénario `scripts/test-postgres-image.sh` ajoute un contrôle avant ses nouvelles écritures HTTP PostgreSQL. Après le premier démarrage sain du candidat, il arrête l’application et PostgreSQL, exige un arrêt applicatif propre et exécute la sonde `sqlite-return` dans un conteneur temporaire séparé. Les deux sources synthétiques sont montées en lecture seule ; seule une copie privée dans `/tmp` est ouverte en écriture. Le conteneur n’a ni port publié, ni accès aux volumes PostgreSQL ou à l’installation habituelle.

La sonde vérifie la santé HTTP du vrai serveur SQLite, le refus d’un accès anonyme, la session `admin` de test conservée, les 18 tables du foyer via une sauvegarde SQLite téléchargée, l’intégrité des deux copies et les empreintes inchangées des deux sources. Le profil réseau `none` garde seulement la boucle locale, ce qui permet cette sonde HTTP interne ([documentation Docker](https://docs.docker.com/engine/network/drivers/none/)). L’écoute utilise un port temporaire sur `127.0.0.1` à l’intérieur du conteneur.

Les copies héritent des permissions des fichiers sources : elles seules sont rendues inscriptibles en mode `0600` avant ouverture. Les originaux restent en lecture seule. Après réussite, le conteneur temporaire disparaît puis le scénario reprend le même candidat PostgreSQL avant ses tests historiques d’écritures, recréation et panne/reprise. Toute erreur interrompt le scénario ; les règles de nettoyage et de diagnostic existantes demeurent applicables.

Ce contrôle prouve le redémarrage sur des **copies**, pas une commutation d’un ancien volume réel, une bascule du serveur personnel ou une réplication inverse. La session constante n’existe que dans les fixtures synthétiques ; ce programme n’est pas un outil pour des bases privées.

### Commande Linux après publication

Les fichiers modifiés sont des sondes exclues de l’image, exécutées par entrée standard. L’image déjà vérifiée `manger:pg-test-31ed51d` peut donc être réutilisée :

```sh
(
  set -eu
  cd ~/services/manger
  git diff --quiet
  git diff --cached --quiet
  git pull --ff-only origin development
  sh scripts/test-postgres-image.sh manger:pg-test-31ed51d
)
```

Si cette image n’est plus disponible, utiliser les commandes de construction du [scénario Docker](POSTGRESQL-DOCKER.md#exécuter-le-scénario). Le tag habituel `manger:0.1.0` et l’installation existante ne sont pas remplacés.

### Preuve et limite de cette tranche

Quatre tests natifs exécutent les programmes de sonde par leur véritable entrée standard : source complète avec photos, source spécifique Docker, source invalide et session absente. Les deux cas valides incluent des sources en mode `0444`. L’intégrité et les empreintes sont contrôlées ; un refus renvoie le code 1 sans message de réussite. Ils ne prouvent pas le montage read-only ou les permissions POSIX effectives sous Linux. Syntaxe shell et JavaScript contrôlées ; la nouvelle exécution Docker Linux reste à rapporter par l’administrateur. Les étapes 20b, 21 finale, 22 et 23 ne sont pas closes par cette préparation.

Résultat local du 27 octobre : **411 tests généraux réussis sans échec ou ignoré, HTTPS inclus**. Les sondes PostgreSQL historiques source/écriture/vérification passent sur un cluster natif temporaire. Le bloc shell testé avec un faux Docker arrête app/PG avant la sonde, reprend seulement après succès et propage un refus 47 sans lancer de nouvelles écritures. Deux cycles de relecture, correction des permissions puis aucun nouveau constat. La suite PostgreSQL complète du 26 octobre n’a pas été relancée pour cette extension exclue de l’image.

## Résultat Linux du 27 octobre — retour aux copies confirmé

Sortie complète transmise par l’administrateur : dépôt mis à jour sur `de077a7`, scénario exécuté avec l’image existante `manger:pg-test-31ed51d` et Docker Compose 5.6.0. Le transfert des 22 tables affiche `ready` et termine avec le code 0. Après démarrage sain, app et PostgreSQL sont arrêtés ; le message « Retour SQLite vérifié : compte, 18 tables et sources inchangées » est présent. Le candidat reprend ensuite et poursuit les écritures HTTP.

La suite du scénario réussit également : suppression/recréation des deux conteneurs en conservant leurs volumes, contrôle des 18 tables du foyer, photos, session et prochaine identité, coupure/reprise PostgreSQL sur le même processus applicatif et refus de migration manquante. TLS positif/négatif et bootstrap répété refusé passent. Le message final « Candidat vérifié » et le nettoyage des deux conteneurs, deux volumes et deux réseaux synthétiques sont présents, sans message d’arrêt en erreur.

Cette sortie confirme donc l’extension sur Docker Linux, y compris l’ouverture des copies privées issues de sources en lecture seule. La source Docker contient une session mais aucune photo au moment du retour SQLite ; les photos sont exercées ensuite dans PostgreSQL. Ce n’est pas une preuve de retour d’un volume privé, d’archive administrative complète restaurée sous Linux, de dimensionnement sur les données réelles ou de bascule. La restauration native de l’archive récente reste la preuve distincte de 21a. CI 20b, acceptation finale 21, guide Linux 22 et bascule 23 demeurent ouverts.

## Restauration Docker complète — préparation du 27 octobre

Le second argument facultatif de `scripts/test-postgres-image.sh` choisit une **image d’outils séparée**, construite avec `docker/postgres-tools.Dockerfile` à partir du même candidat. Sans cet argument, le scénario déjà réussi conserve son périmètre. Avec lui, le script ajoute `compose.postgres-rehearsal.yaml` et son profil `instance-rehearsal`. Aucun Node.js ou PostgreSQL n’est à installer sur l’hôte Ubuntu ; les outils sont dans les conteneurs.

### Contrat du scénario étendu

1. Arrêter l’application avant ses nouvelles écritures, sauvegarder les 22 tables et métadonnées avec `postgres-instance.js`, puis vérifier l’archive initiale. Reprendre les écritures synthétiques et les contrôles de persistance existants.
2. Arrêter à nouveau l’application. Exiger le refus précis `MANGER_INSTANCE_MISMATCH` de l’ancienne référence ; créer et vérifier une archive récente. Aucun écrivain applicatif de la source ne reprend ensuite pendant la comparaison.
3. Initialiser un second PostgreSQL neuf sur le volume distinct `recovery-data`, puis restaurer l’archive récente avec les trois confirmations administratives. Vérifier l’état `verified-closed` et un vrai refus applicatif `42501` avant ouverture explicite.
4. Ouvrir le secours, démarrer `app-recovery` avec son propre volume `recovery-runtime`, retrouver la session importée et créer une recette avec une identité supérieure aux précédentes. Vérifier que la source correspond toujours à l’archive récente après cette écriture sur le secours.
5. Exiger tous les contrôles historiques et nettoyer seulement les ressources étiquetées de ce projet. Rapporter les secondes du parcours de secours synthétique et l’espace des archives ; ce ne sont ni le pic d’espace global, ni une estimation de maintenance réelle.

La source et le secours sont deux clusters indépendants avec de nouveaux rôles portant les mêmes noms. Dans **ce seul test**, ils réutilisent les mêmes secrets synthétiques de rôles et le certificat de test, dont les SAN couvrent les deux noms de services. L’image applicative ne monte toujours que son mot de passe et la CA ; le conteneur d’outils reçoit le mot de passe migrateur et la CA. Aucun mot de passe de rôle, certificat, clé privée ou configuration d’exploitant n’est contenu dans l’archive d’instance. Le dossier d’archives est privé, non chiffré et supprimé à la fin d’un test réussi ; ce n’est pas la procédure de conservation d’une vraie sauvegarde.

### Construire les outils et exécuter sur le Linux de test

Après publication autorisée sur `development`, depuis le même Linux et avec l’image candidate déjà vérifiée :

```sh
(
  set -eu
  cd ~/services/manger
  git diff --quiet
  git diff --cached --quiet
  git pull --ff-only origin development
  candidate_image=manger:pg-test-31ed51d
  tools_image="manger:pg-tools-$(git rev-parse --short HEAD)"
  docker build --build-arg MANGER_CANDIDATE_IMAGE="$candidate_image" \
    -f docker/postgres-tools.Dockerfile -t "$tools_image" .
  sh scripts/test-postgres-image.sh "$candidate_image" "$tools_image"
)
```

Le paquet `postgresql18-client` doit être disponible dans les dépôts Alpine déjà déclarés dans l’image candidate ; le build vérifie la version majeure18 de `pg_dump` et `pg_restore`. Il n’ajoute pas de dépôt edge ou de paquet serveur. Si le paquet est absent ou si le build échoue, le bloc s’arrête avant le scénario : conserver l’erreur pour diagnostic, ne pas contourner les contrôles. Pour une image candidate absente, suivre d’abord sa construction isolée dans [POSTGRESQL-DOCKER.md](POSTGRESQL-DOCKER.md#exécuter-le-scénario). Le tag et le Compose de l’installation habituelle restent inchangés.

### Validation disponible et limites

`test-support/postgres-image-recovery.integration.cjs` réutilise les programmes source/sondes de l’image sur deux vrais PostgreSQL natifs temporaires : archive ancienne refusée, récente restaurée, connexion fermée puis ouverte, session et nouvelle identité par HTTP, source conservée. Seuls les chemins de fichiers, le port HTTP et les assertions propres au conteneur sont adaptés au harnais ; ce test ne prouve pas le montage Docker, le client Alpine ou l’exécution Linux. Il est intégré à la commande PostgreSQL complète. Les tests de configuration vérifient l’isolation prévue et le fait que le Dockerfile web reste sans outils.

Le véritable exécutable Compose5.6.0 Windows, téléchargé de la publication officielle avec son SHA256 vérifié, a rendu la configuration fusionnée sans moteur Docker. Les volumes source/secours et runtime sont effectivement différents, les secrets web et outils séparés, le réseau backend privé et aucun port hôte déclaré. Cela vérifie la sémantique `extends`, sans construire d’image ou créer de conteneur. L’exécutable et les sorties restent dans les outils locaux ignorés, sans installation système.

La CI préparée construit désormais les deux images et exige ce parcours complet après les deux suites de moteurs ; elle reste inactive tant qu’aucun runner n’est configuré. Le résultat de la nouvelle exécution Linux reste à transmettre. Les étapes20b,21 finale,22 et23 restent ouvertes ; aucun test sur données personnelles ou appareil et aucune bascule réelle.

Sources vérifiées le 27 octobre : [paquet client18 Alpine3.23](https://pkgs.alpinelinux.org/package/v3.23/main/x86_64/postgresql18-client), [chemins des exécutables](https://pkgs.alpinelinux.org/contents?arch=x86_64&branch=v3.23&name=postgresql18-client&repo=main), [fusion `extends` et volumes par cible](https://docs.docker.com/reference/compose-file/services/#extends), [Compose5.6.0 officiel](https://github.com/docker/compose/releases/tag/v5.6.0), [pg_dump18 et limites de l’archive](https://www.postgresql.org/docs/18/app-pgdump.html).

Validation finale de cette préparation : **413 tests généraux et244 PostgreSQL réussis sans échec ou ignoré, HTTPS inclus**. Trente fichiers et32 parents PostgreSQL ; outils absents :32 échecs explicites, aucun succès/ignoré, code1 attendu. Faux Docker sur le bloc réel : erreur de restauration47, divergence non spécifique et mauvais état fermé bloquent la réouverture. Ancien parcours sans second argument et règles de nettoyage conservés. Ces preuves locales n’exécutent pas le client Alpine ou les conteneurs.

## Résultat Docker complet du 27 octobre — restauration confirmée

Sortie complète transmise par l’administrateur : scénario `31530b0`, image applicative `manger:pg-test-31ed51d`, image d’outils `manger:pg-tools-31530b0`, Compose 5.6.0. L’image d’outils est construite avec succès depuis le candidat, le paquet client18 Alpine installé et les deux versions d’exécutables vérifiées. Le warning `InvalidDefaultArgInFrom` concerne l’ARG sans valeur par défaut ; cette commande fournit explicitement l’image de base et la construction réussit. Aucun contournement ou changement de code n’est nécessaire pour interpréter ce résultat.

La première archive affiche `backed-up` puis `verified-open` sur 22 tables. Après les écritures et contrôles de persistance, le scénario franchit le refus précis de l’ancienne référence et crée/vérifie l’archive récente. Le second cluster est initialisé sur son volume propre ; `restore` et `verify` affichent tous deux `verified-closed`, puis la sonde confirme le refus d’accès applicatif. `open` affiche `ready`, le web de secours démarre sain et la sonde HTTP retrouve la session puis crée une recette avec une nouvelle identité. La source affiche encore `verified-open` par rapport à l’archive récente après cette écriture sur le secours.

Le résultat final « Reprise complète vérifiée » est présent, suivi du refus de migration absente, de « Candidat vérifié » et du retrait des **quatre conteneurs, quatre volumes et deux réseaux** du seul projet synthétique. Retour aux copies SQLite, TLS positif/négatif, bootstrap répété refusé et panne/reprise PostgreSQL passent aussi dans ce même parcours. Aucun arrêt en erreur n’est indiqué.

Mesures affichées : **17 secondes** pour le parcours de secours chronométré (provisionnement du second cluster, restauration, contrôles, ouverture et HTTP), et **260 Kio alloués** au dossier contenant les deux archives selon `du -sk`. Ce n’est ni la durée totale du scénario, ni l’espace logique exact des dumps, ni le pic disque des clusters/images, ni une mesure de maintenance sur les données privées.

Le build client Alpine, les montages, le TLS interconteneurs et la restauration administrative Linux disposent désormais de leur preuve. Les notes précédentes d’attente décrivent la préparation historique. Aucun besoin de rejouer ce point acquis ; la CI20b reste sans runner, la répétition/procédure privée et l’acceptation finale21 restent distinctes, puis le guide22 et la bascule volontaire23. Aucune installation habituelle ou donnée réelle basculée et aucune validation appareil revendiquée.

## Import privé Linux confirmé le 27 octobre 2026

Le résultat transmis par l’administrateur pour `c150934` confirme la [commande assistée](POSTGRESQL-ADMIN.md#résultat-privé-reçu-le-27-octobre-2026) : copie complète arrêtée et reprise de la source SQLite, import comparant22tables, archive vérifiée et santé web du projet séparé. Copies, secrets et rapports restent uniquement sur son Linux ; aucune base ou clé transmise au dépôt/runner/agent. Mesures2s pour copie/reprise et1s pour import, sans durée totale ou espace privé dans cette sortie. Le port HTTPS retourné est local au serveur.

Ce sous-parcours privé est acquis ; ne pas rejouer l’import. L’instance officielle reste SQLite. Restauration de cette archive privée sur secours et mesures disque complètes encore à rapporter ; aucune recette navigateur/iPhone, bascule23 ou activation20b déduite du succès. Les prochaines écritures dans la copie imposent une archive récente pour les comparaisons ultérieures.
