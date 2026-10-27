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
