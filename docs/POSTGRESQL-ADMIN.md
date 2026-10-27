# Administrer le candidat PostgreSQL

27 octobre 2026 — **guide préparatoire 22a**. Le moteur standard reste SQLite. Ce document prépare une installation distincte ; il ne déclenche aucune conversion et n’autorise pas une bascule implicite. La restauration Docker synthétique est [validée](POSTGRESQL-REPETITION.md#résultat-docker-complet-du-27-octobre--restauration-confirmée) et le [profil HTTPS a réussi sur Linux](#résultat-linux-du-profil-https--27-octobre-2026). CI 20b sans runner, exécution privée du guide et recette 23 ne sont pas déclarées terminées.

Les blocs sont destinés à l’administrateur, depuis `~/services/manger`, sur Linux avec Docker/Compose et OpenSSL. Aucun Node ou PostgreSQL hôte n’est nécessaire. Ne pas publier les fichiers privés, archives ou sorties de création de compte. Aucun `down --volumes`, nettoyage global, remplacement de l’ancien volume ou `git reset` n’est nécessaire.

## Commande assistée sur copie privée

Pour le Linux où les deux images ci-dessous ont déjà réussi les scénarios synthétiques, cette commande automatise les préparatifs, la copie, l’import et la première archive des sections2–6. **Elle ne fait pas la bascule23** et ne remplace pas le contrôle du résultat par l’administrateur.

```sh
(
  set -eu
  cd ~/services/manger
  git diff --quiet
  git diff --cached --quiet
  git pull --ff-only origin development
  bash scripts/rehearse-private-postgres.sh \
    manger:pg-test-31ed51d manger:pg-tools-31530b0
)
```

Le script exige Linux, Docker/Compose et OpenSSL, les images déjà présentes et les trois certificats web existants dans `tls/server`. Il identifie le conteneur `manger-manger-1`, ses étiquettes Compose `manger` et son moteur SQLite ; il refuse les ressources d’une répétition déjà présente. Ne pas l’utiliser avec une source déjà migrée ou un autre nom de projet. Aucun nouveau build ni accès SSH par l’agent.

Le dossier **`~/services/manger-postgres-validation-private`**, créé exclusivement avec permissions privées, conserve la copie complète de `/data`, l’identité/image du conteneur, les configurations existantes et TLS, les nouveaux secrets PostgreSQL, rapports, journaux, archive et mesures. Les bases sont copiées conteneur arrêté ; s’il était actif, il est relancé et sa santé contrôlée **avant l’analyse/import**. S’il était initialement arrêté, il reste arrêté. En cas d’échec ordinaire ou signal HUP/INT/TERM, la reprise d’une source arrêtée par ce script est retentée ; une reprise impossible est signalée explicitement. Cela ne garantit pas le redémarrage après coupure de courant, arrêt du daemon ou SIGKILL : vérifier alors `docker start manger-manger-1`, puis `docker inspect --format '{{.State.Health.Status}}' manger-manger-1` avant toute poursuite.

Le projet séparé `manger-postgres-validation` a ses propres volumes/secrets et un port HTTPS aléatoire **sur127.0.0.1 uniquement**, affiché à la fin. SMTP neutralisé, aucun compte créé ou réinitialisé. Analyse en lecture seule, comparaison de22tables par l’importeur existant, archive puis vérification avant démarrage du web privé ; empreintes des copies SQLite contrôlées à nouveau. Les mesures distinguent copie/reprise et import, sans promesse de durée de bascule. L’ancien volume et l’instance SQLite habituelle restent en place et officiels.

**Ne pas relancer la commande en supprimant le dossier ou les volumes après une erreur** : tous les fichiers sont conservés pour diagnostic/reprise ; une importation au résultat incertain ne doit pas être répétée aveuglément. Ne transmettre que les lignes finales non sensibles ou le message d’arrêt du script, jamais le contenu du dossier privé. Ce premier passage ne restaure pas encore cette archive privée sur un second cluster, n’active pas la CI et ne valide pas Safari. L’exécution sur données privées par l’administrateur reste à rapporter ; les tests locaux avec faux Docker ne la démontrent pas.

### Résultat privé reçu le 27 octobre 2026

L’administrateur a exécuté `c150934` avec les deux images indiquées. Le message final confirme l’analyse/import avec comparaison des **22 tables**, l’archive vérifiée, la copie SQLite figée conservée et la santé du web privé ; le script n’affiche ce résultat qu’après ces contrôles. La source SQLite a retrouvé son état initial avant import. Mesures affichées : **2 secondes pour copie/reprise**, **1 seconde pour import**. Ni durée totale (certificats, provisionnement, archive et web inclus), ni espace disque privé ne sont fournis par cette sortie.

Le port retourné est lié à127.0.0.1 et au projet distinct `manger-postgres-validation` ; ce n’est pas une nouvelle URL LAN/iPhone. Pour une vérification visuelle depuis un PC, utiliser une redirection SSH locale vers le port retourné, sans changer les ports Compose. Se connecter à cette copie avec le compte existant ; les modifications de cette copie restent dans PostgreSQL, pas dans SQLite. Fermer le tunnel ne supprime ni la copie ni ses volumes. Toute archive antérieure aux nouvelles écritures doit ensuite être remplacée par une référence récente pour les contrôles de restauration.

L’import privé et la première archive disposent désormais de leur preuve Linux. Aucune base ou clé n’a été transmise à l’agent. Restauration de l’archive privée sur secours, espace mesuré, recette utilisateur/appareil, activation CI20b et bascule23 restent distincts ; l’instance habituelle reste SQLite. Ne pas relancer l’import réussi.

## 1. Configuration et images

Trois usages restent distincts :

| Commande/configuration | Usage |
| --- | --- |
| `docker compose …` habituel | Instance SQLite existante, avec son `.env` et son override HTTPS éventuel. |
| `pgc …` défini ci-dessous | Instance PostgreSQL nommée explicitement, ses secrets et ses volumes propres. |
| `test-postgres-image.sh` | Seulement données et ressources synthétiques, supprimées après réussite. Jamais une commande de sauvegarde privée. |

Pour le Linux où les images ont déjà été testées, conserver ces tags sans les écraser :

```sh
cd ~/services/manger
candidate_image=manger:pg-test-31ed51d
tools_image=manger:pg-tools-31530b0
docker image inspect "$candidate_image" "$tools_image" >/dev/null
```

Sur une nouvelle machine, ou pour une nouvelle révision, **à la place** de ce choix d’images :

```sh
(
  set -eu
  cd ~/services/manger
  git diff --quiet
  git diff --cached --quiet
  candidate_image="manger:pg-admin-$(git rev-parse --short HEAD)"
  tools_image="$candidate_image-tools"
  docker build --pull -t "$candidate_image" .
  docker build --build-arg MANGER_CANDIDATE_IMAGE="$candidate_image" \
    -f docker/postgres-tools.Dockerfile -t "$tools_image" .
  sh scripts/test-docker.sh "$candidate_image"
  sh scripts/test-postgres-image.sh "$candidate_image" "$tools_image" --admin-https
)
```

Le sous-shell ne conserve pas les deux variables : remettre ensuite `candidate_image` et `tools_image` aux tags effectivement testés. La construction et les tests doivent réussir avant de modifier une instance. Pas d’image publique préconstruite promise.

### Session de répétition privée

```sh
cd ~/services/manger
pg_repo="$PWD"
pg_project=manger-postgres-validation
pg_private="$HOME/services/$pg_project-private"
pgc() {
  MANGER_PG_SECRETS_DIR="$pg_private/secrets" \
  MANGER_PG_SOURCE_DIR="$pg_private/source" \
  MANGER_PG_ARCHIVE_DIR="$pg_private/archives" \
  docker compose --project-name "$pg_project" --env-file "$pg_private/instance.env" \
    --file "$pg_repo/compose.postgres.yaml" --file "$pg_repo/compose.postgres.instance.yaml" "$@"
}
```

Conserver ce terminal et ces variables pendant la procédure. Après reconnexion, redéfinir cette session avec le bon projet et dossier ; ne pas réexécuter la création exclusive du dossier existant. Les variables `MANGER_…` exportées dans le shell ont priorité sur le fichier env : retirer les réglages ambiants contradictoires. Les trois chemins de données privés sont fixés dans `pgc` pour ne pas hériter d’un ancien test.

## 2. Préparer des secrets et certificats persistants

Pour une migration, **réutiliser les trois fichiers web déjà approuvés** sous `tls/server` : `server.crt`, `server.key`, `ca.crt`. Cela conserve la confiance et, à URL identique, l’origine du navigateur. Ne jamais monter `tls/ca.key` dans l’application. Si ces fichiers n’existent pas, préparer d’abord le [HTTPS local](HTTPS.md) et sa confiance sur les appareils ; une installation neuve n’en dispose pas automatiquement.

La nouvelle autorité ci-dessous ne sert qu’au lien interne PostgreSQL. Le certificat serveur couvre le nom Docker `postgres`, dure 365 jours et n’est pas renouvelé automatiquement. L’autorité dure dix ans. Ne pas réutiliser les certificats synthétiques d’un jour du script de test.

<!-- shell:prepare-postgres-private -->
```sh
(
  set -eu
  umask 077
  for file in server.crt server.key ca.crt; do test -r "$pg_repo/tls/server/$file"; done
  mkdir "$pg_private"
  mkdir "$pg_private/secrets" "$pg_private/pki" "$pg_private/source" "$pg_private/archives"
  for role in app migration bootstrap; do
    openssl rand -hex 32 > "$pg_private/secrets/$role-password"
  done
  openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 -subj /CN=MangerPostgresCA \
    -addext basicConstraints=critical,CA:TRUE,pathlen:0 -addext keyUsage=critical,keyCertSign,cRLSign \
    -keyout "$pg_private/pki/ca.key" -out "$pg_private/secrets/ca.crt" > "$pg_private/pki/openssl.log" 2>&1
  openssl req -new -newkey rsa:2048 -nodes -sha256 -subj /CN=postgres \
    -keyout "$pg_private/secrets/server.key" -out "$pg_private/pki/server.csr" >> "$pg_private/pki/openssl.log" 2>&1
  printf '%s\n' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature,keyEncipherment' \
    'extendedKeyUsage=serverAuth' 'subjectAltName=DNS:postgres,DNS:localhost,IP:127.0.0.1' > "$pg_private/pki/server.ext"
  openssl x509 -req -in "$pg_private/pki/server.csr" -CA "$pg_private/secrets/ca.crt" \
    -CAkey "$pg_private/pki/ca.key" -set_serial "0x$(openssl rand -hex 16)" \
    -days 365 -sha256 -extfile "$pg_private/pki/server.ext" \
    -out "$pg_private/secrets/server.crt" >> "$pg_private/pki/openssl.log" 2>&1
  chmod 0444 "$pg_private/secrets/"*
  printf '%s\n' "MANGER_CANDIDATE_IMAGE=$candidate_image" "MANGER_POSTGRES_TOOLS_IMAGE=$tools_image" \
    "MANGER_WEB_TLS_DIR=$pg_repo/tls/server" 'MANGER_INSTANCE_BIND_ADDRESS=127.0.0.1' 'MANGER_INSTANCE_PORT=0' \
    "MANGER_MAINTENANCE_UID=$(id -u)" "MANGER_MAINTENANCE_GID=$(id -g)" > "$pg_private/instance.env"
  git -C "$pg_repo" rev-parse HEAD > "$pg_private/code-revision.txt"
)
```

Le premier `mkdir` refuse un dossier déjà présent : ne pas le supprimer pour contourner un échec. Les fichiers de secrets sont lisibles individuellement dans leurs seuls conteneurs autorisés ; le dossier parent privé 0700 interdit leur lecture aux autres comptes ordinaires de l’hôte. La clé CA interne reste privée 0600 sous `pki`, hors des montages. Les secrets Compose sont des fichiers montés, **pas un stockage chiffré**. Les fichiers web doivent rester lisibles par l’utilisateur `node` 1000 de l’image ; suivre les permissions de [HTTPS.md](HTTPS.md) si nécessaire, sans rendre la clé web publique.

Utiliser des chemins simples sans `$`, retour à la ligne ou ` #` dans ce fichier env. Vérifier les dates et l’identité des certificats sans imprimer leurs clés :

```sh
(
  set -eu
  openssl verify -CAfile "$pg_private/secrets/ca.crt" -verify_hostname postgres "$pg_private/secrets/server.crt"
  openssl x509 -in "$pg_repo/tls/server/server.crt" -noout -dates -ext subjectAltName
  pgc --profile maintenance config --quiet
)
```

La répétition publie le web seulement sur la boucle locale, port temporaire 0. Ne pas lui donner l’URL partagée du foyer ou des destinataires SMTP. Le profil ne publie jamais 5432. La préparation SMTP existante reste facultative : reporter ses paramètres privés `MANGER_SMTP_*` et `MANGER_APP_URL` seulement pour l’instance retenue, sans afficher ou partager `config` complet.

Dans le fichier env, les valeurs SMTP contenant `$` doivent être écrites entre quotes simples pour rester littérales ; les valeurs nues ou entre guillemets doubles sont interpolées par Compose. Préserver la valeur privée, ne pas inventer un mot de passe d’exemple utilisable.

## 3. Choisir la source

### Répétition depuis l’instance SQLite existante

Ce bloc est réservé au projet de validation. Il arrête brièvement SQLite, copie **tout `/data`** dans le dossier privé neuf, puis redémarre l’instance courante. Celle-ci reste la seule origine officielle ; les copies sont une photographie de répétition et devront être refaites après un nouvel arrêt pour la bascule finale.

```sh
(
  set -eu
  test "$pg_project" = manger-postgres-validation
  test -z "$(find "$pg_private/source" -mindepth 1 -maxdepth 1 -print -quit)"
  cd "$pg_repo"
  docker compose stop manger
  if ! docker compose cp manger:/data/. "$pg_private/source/"; then
    docker compose start manger
    exit 1
  fi
  docker compose start manger
  test -f "$pg_private/source/manger.db"
  test -f "$pg_private/source/accounts.db"
)
```

Garder également une copie privée de l’ancien `.env`, de ses fichiers Compose/override et de tout le dossier TLS, clé d’autorité comprise. Aucune clé ne va dans Git ou l’archive du foyer. Si la copie échoue, l’erreur doit être examinée ; ne pas considérer une copie partielle comme une sauvegarde.

### Nouvelle installation, à la place de la copie SQLite

Ce bloc crée uniquement les deux fichiers d’amorçage dans le dossier source neuf ; il ne touche pas à un service existant. Il n’enregistre pas de compte ou de mot de passe par défaut. Le catalogue initial standard est celui de `createDatabase` ; les imports de catalogue restent volontaires.

```sh
docker run --rm --read-only --network none --tmpfs /tmp --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,src=$pg_private/source,dst=/source" --entrypoint node "$candidate_image" -e '
const fs=require("node:fs");for(const name of ["manger.db","accounts.db"])if(fs.existsSync("/source/"+name))throw Error("Source déjà présente : refus");
require("./server").createDatabase("/source/manger.db").close();require("./accounts").openAccounts("/source/accounts.db").close();'
```

### Analyser sans modifier la source

```sh
docker run --rm --read-only --network none --tmpfs /tmp --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,src=$pg_private/source,dst=/source,readonly" --entrypoint node "$candidate_image" \
  migration-source.js /source/manger.db /source/accounts.db --source-stopped
```

Les deux fichiers doivent être complets et figés. L’analyse refuse les fichiers WAL/SHM/journal associés : **ne pas supprimer ces journaux pour faire passer le contrôle**. Conserver les copies et demander un diagnostic local. Le rapport contient effectifs/empreintes, pas les lignes privées ; ne pas transmettre les bases à l’agent ou la CI.

## 4. Importer dans une cible neuve

Vérifier que le nom de projet et le dossier privé désignent bien la nouvelle cible, et pas une précédente répétition. Un dossier privé neuf ne garantit pas qu’un ancien volume portant le même nom de projet soit absent : examiner les noms avant toute création.

<!-- shell:import-postgres-fresh -->
```sh
(
  set -eu
  existing_volumes=$(docker volume ls --format '{{.Name}}')
  for volume in "${pg_project}_postgres-data" "${pg_project}_runtime-data"; do
    if printf '%s\n' "$existing_volumes" | grep -Fxq "$volume"; then
      echo 'Volume cible déjà présent : arrêt sans modification.' >&2
      exit 1
    fi
  done
  pgc --profile maintenance config --quiet
  pgc up -d --wait --wait-timeout 90 postgres
  pgc run --rm --no-deps -T migrate import /source/manger.db /source/accounts.db --source-stopped --target-empty
)
```

L’import ne doit réussir que sur une cible vide. Attendre `ready` et 22 tables comparées. Refus, `pending` ou réponse incertaine : ne pas démarrer le web et ne pas rejouer l’import sur cette même cible. Garder la source et les diagnostics privés. Si l’outil affiche un identifiant de contrôle après engagement incertain :

```sh
printf 'Identifiant de contrôle affiché par l’import : '
read -r transfer_nonce
pgc run --rm --no-deps -T migrate verify /source/manger.db /source/accounts.db --source-stopped "$transfer_nonce"
```

Un résultat ambigu nécessite une décision opérateur ; ni fusion, ni écrasement ou retrait de volume automatique. Les commandes [de transfert](POSTGRESQL-TRANSFERT.md) et [d’analyse](POSTGRESQL-SOURCES.md) précisent les cas refusés.

## 5. Vérifier le web et les comptes

Pour une répétition, conserver bind 127.0.0.1 et port 0 : cette URL n’est pas celle du foyer et ses écritures éventuelles restent dans la copie privée. Les comptes importés gardent leurs mots de passe et sessions, sous réserve de leur expiration ; ne pas recréer un administrateur existant.

```sh
(
  set -eu
  pgc up -d --no-build --wait --wait-timeout 90 app
  pgc exec -T app node healthcheck.js
  pgc port app 3000
  pgc ps
)
```

La santé vérifie HTTPS avec sa CA et PostgreSQL. Elle ne prouve pas la confiance Safari, l’accès VPN ou le SAN de l’adresse utilisée par le téléphone. Depuis un poste distant, la boucle locale nécessite un tunnel choisi par l’administrateur ; ne pas élargir le bind pour contourner ce test.

**Uniquement pour une installation neuve sans aucun accès**, créer le premier administrateur dans son terminal privé :

```sh
pgc exec app node accounts.js create-admin admin
```

La sortie contient un mot de passe généré : le conserver dans son gestionnaire, **ne pas coller cette sortie dans le chat ou une issue**. Récupération d’un compte existant : `pgc exec app node accounts.js reset-password admin`, avec le même caractère privé ; cette action révoque ses sessions. Une personne du foyer et un compte de connexion restent deux objets distincts.

## 6. Sauvegarder une instance PostgreSQL

Le bouton du foyer exporte les données/photos sans les accès. La sauvegarde administrateur suivante inclut 22 tables et métadonnées. Elle n’inclut pas les rôles/secrets/certificats globaux, le code ni les fichiers de récupération du volume runtime : les conserver séparément avec les mêmes protections et une politique de durée.

```sh
(
  set -eu
  archive_name="instance-$(date -u +%Y%m%dT%H%M%SZ)"
  pgc stop app
  pgc --profile maintenance run --rm --no-deps -T instance backup "/archives/$archive_name"
  pgc --profile maintenance run --rm --no-deps -T instance verify "/archives/$archive_name"
  mkdir "$pg_private/archives/$archive_name-runtime"
  pgc cp app:/data/. "$pg_private/archives/$archive_name-runtime/"
  printf '%s\n' "$archive_name" > "$pg_private/latest-archive.txt"
  pgc up -d --no-build --wait --wait-timeout 90 app
)
```

Arrêter aussi tous les autres écrivains administratifs, scripts et tâches de restauration. Ne pas arrêter PostgreSQL pendant `pg_dump`. Un échec laisse l’application arrêtée pour examen, sans afficher une réussite ; garder les dossiers partiels. Avant reprise, confirmer la sauvegarde ou décider explicitement de reprendre l’instance inchangée. `verify` compare un état ponctuel : après de nouvelles écritures, une ancienne archive peut rester valide historiquement mais ne plus correspondre exactement à l’instance actuelle.

Les archives et copies runtime sont non chiffrées. Sauvegarder aussi `instance.env`, les secrets/pki et le TLS web original sur un support privé protégé, idéalement hors de ce serveur. Ne pas copier des clés ou données dans le dépôt. Vérifier régulièrement une restauration sur une cible distincte.

## 7. Restaurer vers un secours distinct

Ne pas appliquer cette procédure à une cible contenant déjà des données. Avant de changer les variables de session, retenir le chemin d’une archive récente produite après arrêt de tous les écrivains ; ne jamais exécuter une archive SQL de provenance inconnue.

```sh
archive_name=$(cat "$pg_private/latest-archive.txt")
saved_archive="$pg_private/archives/$archive_name"
pg_project=manger-postgres-recovery
pg_private="$HOME/services/$pg_project-private"
```

Reprendre la **préparation exclusive de la section 2** sur ce nouveau dossier et projet, avec les mêmes images de code et les mêmes noms de rôles, mais des secrets neufs. Ne pas importer SQLite ni ouvrir le web. Les archives de données ne provisionnent pas les rôles. Une fois ce dossier prêt :

<!-- shell:restore-postgres-fresh -->
```sh
(
  set -eu
  existing_volumes=$(docker volume ls --format '{{.Name}}')
  for volume in "${pg_project}_postgres-data" "${pg_project}_runtime-data"; do
    if printf '%s\n' "$existing_volumes" | grep -Fxq "$volume"; then
      echo 'Volume de secours déjà présent : arrêt sans modification.' >&2
      exit 1
    fi
  done
  test -d "$saved_archive"
  test ! -e "$pg_private/archives/recovery"
  cp -a -- "$saved_archive" "$pg_private/archives/recovery"
  pgc up -d --wait --wait-timeout 90 postgres
  pgc --profile maintenance run --rm --no-deps -T instance restore /archives/recovery --trusted-backup --target-empty --writers-stopped
  pgc --profile maintenance run --rm --no-deps -T instance verify /archives/recovery
)
```

Les deux dernières commandes doivent indiquer `verified-closed`. Elles ne rendent pas le secours accessible au web. **Après décision explicite de retenir ce secours**, toujours sans autre écrivain :

<!-- shell:open-postgres-recovery -->
```sh
(
  set -eu
  pgc --profile maintenance run --rm --no-deps -T instance open /archives/recovery --writers-stopped
  pgc up -d --no-build --wait --wait-timeout 90 app
  pgc exec -T app node healthcheck.js
)
```

En cas de perte de réponse ou erreur de restauration, ne pas rejouer `restore`. Contrôler avec `verify` et garder le secours fermé tant que son état n’est pas établi. La restauration et l’ouverture ne désactivent pas une autre instance : l’administrateur doit éviter deux origines officielles d’écriture. Rôles/secrets du nouveau cluster et archive de données restent séparés.

## 8. Préparer la bascule réelle — étape 23, pas une mise à jour ordinaire

Cette section est un plan opérateur à valider après la répétition privée, les mesures et les prérequis de livraison ; **ne pas l’exécuter simplement parce que le code a été récupéré**. La CI n’est pas déclarée active. Conserver l’ancien volume, l’image réellement utilisée et les configurations/TLS ; ne jamais confondre un tag nouvellement reconstruit avec l’image actuellement fonctionnelle.

### Cas autorisé : anciennes données uniquement de test

Le27octobre, l’administrateur précise que les anciennes données sont des essais sans contenu à récupérer et autorise la mise en service du PostgreSQL déjà validé. Cette dérogation évite une nouvelle copie/import et la restauration privée historique ; elle ne déclare pas ces contrôles réalisés et ne s’applique pas à une migration de données importantes. **Les comptes et données actuels de PostgreSQL sont conservés**, sans suppression, création ou réinitialisation de compte.

Sur le Linux déjà préparé, pour l’adresse LAN indiquée et après vérification qu’elle est toujours celle du serveur :

```sh
(
  set -eu
  cd ~/services/manger
  git diff --quiet
  git diff --cached --quiet
  git pull --ff-only origin development
  bash scripts/promote-postgres-test-instance.sh 192.168.1.31 --test-data-only
)
```

Le script exige que le conteneur SQLite soit celui enregistré par la répétition, avec les bonnes étiquettes/moteur, que l’adresse privée soit réellement locale et que le certificat existant la couvre. Configuration ambiante neutralisée pour les paramètres enregistrés dans le fichier privé, puis chemins des sources/secrets/archives/TLS fixés. Le projet garde le nom `manger-postgres-validation` et ses volumes actuels : changer ce nom créerait une autre cible vide. L’adresse bind est cette seule IP LAN, port3000, avec URL applicative HTTPS correspondante ; SMTP reste désactivé selon la copie. Aucun port PostgreSQL publié.

Avant d’arrêter SQLite, le web PostgreSQL local est arrêté et une **nouvelle archive complète** est créée dans `archives/before-lan`, puis vérifiée contre22tables. Elle inclut une éventuelle réinitialisation du mot de passe de la copie, contrairement à l’archive initiale. L’ancien `instance.env` et les journaux sont conservés dans `promotion/`, créé exclusivement. Ensuite : arrêt explicite de SQLite et confirmation de cet arrêt, remplacement du fichier env préparé, recréation du seul web PostgreSQL avec attente de santé. Le cluster, les volumes, les mots de passe et les certificats ne sont pas recréés.

Le succès affiche l’URL HTTPS habituelle à vérifier sur Safari/iPhone : compte existant, recettes, ajout d’un repas et courses. L’ancien tunnel vers le port privé aléatoire n’est plus l’accès courant. Il faut confirmer la recette sur appareil avant de déclarer23 close ; la CI reste sans runner. La commande n’a pas encore été exécutée sur Linux pour cette bascule, même si l’import et les profils précédents ont réussi.

En cas d’erreur, les fichiers et volumes restent en place. **Ne pas relancer le script et ne pas redémarrer SQLite aveuglément** : l’ouverture LAN, même suivie d’une erreur de santé, peut déjà avoir reçu des écritures PostgreSQL. Aucun retour automatique n’est lancé ; déterminer d’abord quels services tournent et si PostgreSQL a reçu des écritures. Un refus pendant la première archive laisse le web privé arrêté mais ne stoppe pas SQLite. HUP/INT/TERM affichent le stade d’arrêt ; une coupure/SIGKILL ne peut exécuter ce diagnostic.

Après succès, administrer cette instance avec les fichiers `compose.postgres.yaml` et `compose.postgres.instance.yaml`, le fichier privé et le nom de projet explicite ; le Compose SQLite standard n’est pas devenu un Compose PostgreSQL. Lire la section9 pour les futures mises à jour. L’ancien conteneur/volume reste conservé et arrêté, sans nettoyage automatique.

Vérifications locales de cette commande :14 scénarios fictifs réussis, relecture indépendante sans constat, vrai rendu Compose5.6.0 confirmant port/URL/secrets/volumes. **La suite générale reste partiellement en échec** sur ce PC :413/415 au dernier passage groupé, deux contrôles d’image ; fichier image isolé13/13 et comptes16/16 réussis sans modification des tests. [Détails et limite](DECISIONS.md#27-octobre2026--mise-en-service-autorisée-après-données-de-test). La commande ne construit pas d’image et réutilise celles déjà validées sur Linux ; pas de succès de CI ou de bascule distante déduit de ces contrôles locaux.

### Cas général : données SQLite à conserver

1. Choisir un nouveau projet final `manger-postgres-instance` et son nouveau dossier privé ; refaire la préparation, jamais recycler une cible de répétition déjà importée. Arrêter l’ancienne application et tous les écrivains, puis refaire la copie complète des deux bases dans le nouveau dossier. **Ne pas relancer SQLite à la fin de cette copie finale.**
2. Analyser puis importer ces copies figées, vérifier les 22 tables et conserver une archive administrative de référence avant ouverture. Un `ready` manquant interdit de lancer le web.
3. Dans `instance.env`, mettre l’adresse LAN/VPN et le port correspondant exactement à l’ancienne URL, généralement 3000 ; conserver le même schéma HTTPS et les certificats web approuvés. Renseigner les paramètres SMTP privés retenus et la bonne URL applicative. Aucune ouverture de 5432 ou port public supplémentaire.
4. Démarrer uniquement le projet PostgreSQL choisi, contrôler sa santé puis faire la recette Safari : connexion, recettes/photos, repas/assiettes, courses, sauvegarde et icône. L’ouverture aux clients peut déjà produire des écritures ; ne pas attendre la première modification visible pour considérer ce risque.
5. Retenir une seule instance officielle ; mesurer et consigner le résultat non sensible. Garder les archives/ancien volume selon la politique choisie. Ne pas annoncer Android ou d’autres appareils testés par cette recette Safari.

Retour **avant toute nouvelle écriture** : arrêter le candidat, vérifier l’absence de divergence et les sources finales conservées, puis décider de relancer seulement l’ancienne instance avec son image/configuration d’origine. Après ouverture aux clients ou nouvelle saisie, ne pas promettre un retour SQLite sans perte : arrêter les écrivains, produire une archive PostgreSQL récente et reprendre vers un secours compatible ou décider explicitement du traitement des données. Aucun convertisseur inverse ou verrou empêchant l’administrateur de relancer manuellement une ancienne instance n’est fourni.

## 9. Mise à jour et entretien

Pour une révision gardant le même schéma actuel, construire de nouveaux tags distincts et exécuter les tests isolés avant toute intervention. Arrêter les écrivains, produire et vérifier la sauvegarde complète, conserver configuration et image réellement employée avant de modifier les tags dans `instance.env`. Puis `pgc up -d --no-build --wait --wait-timeout 90 app` et la santé/recette. Ne pas utiliser la commande d’import SQLite pour mettre à jour une base déjà remplie. Une future évolution de schéma exige ses instructions versionnées et son plan de reprise ; un ancien code n’est pas supposé compatible avec un schéma nouveau.

Ne pas remplacer les secrets par de nouvelles valeurs sur un volume PostgreSQL existant : le bootstrap ne tourne qu’à l’initialisation et ne change pas les mots de passe des rôles existants. Renouveler les certificats avant expiration avec l’autorité retenue et recréer/recharger les conteneurs concernés après validation ; le redémarrage ne renouvelle rien et un fichier remplacé peut rester lié à l’ancien inode d’un montage. Rotation de rôles/CA et montée majeure PostgreSQL restent des opérations distinctes, pas une commande de rebuild aveugle.

Diagnostic local : `pgc ps`, `pgc exec -T app node healthcheck.js`, puis `pgc logs --tail 80 app postgres`. Garder les logs bruts privés ; ne pas diffuser `.env`, `config --environment`, mots de passe générés ou archives. Une réponse 503 ou un état unhealthy appelle un contrôle du bon projet, des fichiers/permissions, dates/SAN/CA et de l’état PostgreSQL ; aucun repli SQLite silencieux. Arrêter avec `pgc stop` conserve les volumes ; ne pas ajouter d’option de suppression pour réparer un problème.

## 10. Preuves et limites

Les contrôles historiques complets et la restauration Linux sont détaillés dans la [répétition](POSTGRESQL-REPETITION.md). Pour ce profil permanent : contrat de secrets/ports testé, véritable rendu Compose 5.6.0 sans daemon, source HTTPS native avec CA vérifiée et cookie Secure, secours HTTP interne déjà distinct. Le scénario `--admin-https` a ensuite réussi sur Linux ; ses certificats d’un jour et son port local temporaire restent exclusivement synthétiques. La procédure privée, le renouvellement des certificats et le créneau de bascule ne sont pas exécutés par l’agent.

Le stockage/confidentialité de l’instance et les sauvegardes restent sous la responsabilité de son administrateur ; lire [la notice technique](CONFIDENTIALITE.md). Ce guide n’est pas une certification de conformité. Les secrets par fichiers et l’interpolation suivent les [secrets Compose](https://docs.docker.com/compose/how-tos/use-secrets/) et [priorités du shell/env-file](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/), vérifiés le 27 octobre 2026.

Validation locale finale : **415 tests généraux et244 PostgreSQL réussis sans échec ou ignoré, HTTPS inclus**. Les16 blocs shell du guide sont vérifiés en syntaxe ; préparation de CA/secrets et garde anti-écrasement exercées avec OpenSSL sur des fichiers fictifs ; import/restauration refusés avant `pgc` quand un volume existe ou ne peut pas être listé. Le bloc `open` arrête le démarrage web si sa confirmation échoue. Trois cycles de relecture réconciliés, incident Windows non reproduit et relance complète consignés dans les [décisions](DECISIONS.md#27-octobre-2026--guide-administrateur22a-et-profil-https-permanent). Ces preuves locales et Linux ne remplacent pas l’exécution privée de ce guide.

## Résultat Linux du profil HTTPS — 27 octobre 2026

Sortie complète transmise par l’administrateur : scénario `36c5c8f`, Compose5.6.0, images réutilisées `manger:pg-test-31ed51d` et `manger:pg-tools-31530b0`, option `--admin-https`. Le message « Profil administrateur HTTPS vérifié sur port local temporaire ; aucune bascule » est présent après tous les contrôles. Le scénario vérifie donc aussi sur Linux le web source en HTTPS avec CA explicite et cookieSecure, son redémarrage et la séparation des secrets du profil.

Transfert ready/code0 et22tables, retour aux copies SQLite, archives initiale/récente avec ancienne référence refusée, secours `verified-closed` puis accès refusé avant `ready`, session/identité HTTP sur le secours et source encore conforme : tous les points passent. Le secours reste en HTTP interne selon son profil distinct, sans revendication de HTTPS pour ce service. Le retrait final des quatre conteneurs, quatre volumes et deux réseaux synthétiques est observé, sans message d’échec.

Le parcours de secours chronométré affiche17s et le dossier d’archives260Kio alloués ; ces mesures restent celles du petit jeu synthétique, pas une durée de maintenance ou un pic disque réel. Aucun besoin de rejouer ce test. Restent la répétition privée avec copies/volumes conservés et mesures adaptées, l’acceptation du guide sur cette procédure puis la bascule volontaire et Safari. Le runner CI n’est pas configuré ; l’installation habituelle n’a pas été convertie par ce scénario.
