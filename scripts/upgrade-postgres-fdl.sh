#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(uname -s) == Linux && $(id -u) != 0 ]] || { echo 'Lancer sur Linux depuis le compte habituel, sans sudo.' >&2; exit 1; }
fdl_url=''
if [[ $# != 0 ]]; then
  [[ $# == 2 && $1 == --fdl-url && -n $2 ]] || { echo 'Usage : bash scripts/upgrade-postgres-fdl.sh [--fdl-url https://adresse-fdl]' >&2; exit 1; }
  fdl_url=$2
  [[ $fdl_url != *'$'* && $fdl_url != *"'"* && $fdl_url != *'"'* ]] || exit 1
fi
repo=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
parent=$(cd -- "$repo/.." && pwd -P)
project=manger-postgres-validation
private="$parent/$project-private"
config="$private/instance.env"
[[ -f $config && ! -L $config && ! -L $private/.fdl-upgrade.lock ]] || exit 1
grep -Fxq postgres-lan "$private/promotion/state.txt"
for setting in MANGER_CANDIDATE_IMAGE MANGER_POSTGRES_TOOLS_IMAGE; do
  [[ $(grep -c "^$setting=" "$config") == 1 ]] || exit 1
done
exec 200>>"$private/.fdl-upgrade.lock"
flock -n 200 || { echo 'Une migration FDL est déjà en cours.' >&2; exit 1; }
for setting in "${!MANGER_@}"; do unset "$setting"; done
export MANGER_PG_SECRETS_DIR="$private/secrets" MANGER_PG_SOURCE_DIR="$private/source" MANGER_PG_ARCHIVE_DIR="$private/archives"
export MANGER_WEB_TLS_DIR="$repo/tls/server"
compose() { docker compose --project-name "$project" --env-file "$config" --file "$repo/compose.postgres.yaml" --file "$repo/compose.postgres.instance.yaml" "$@"; }
instance() { local image=$1; shift; MANGER_POSTGRES_TOOLS_IMAGE="$image" compose --profile maintenance run --rm --no-deps -T --pull never instance "$@"; }
schema() {
  MANGER_POSTGRES_TOOLS_IMAGE="$1" compose --profile maintenance run --rm --no-deps -T --pull never --entrypoint node instance -e '
    const {postgresConfig,administrativePool}=require("./db/config");
    (async()=>{const pool=administrativePool(postgresConfig(process.env,{administrative:true}));try{
      const value=(await pool.query("SELECT household.storage_status() AS status")).rows[0].status;
      if(!value.ready)throw Error();console.log(value.version);
    }finally{await pool.end();}})().catch(()=>{console.error("Schéma PostgreSQL non confirmé.");process.exitCode=1;});'
}
compose config --quiet
app=$(compose ps --all --quiet app)
[[ -n $app ]] || { echo 'Application PostgreSQL existante introuvable.' >&2; exit 1; }
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$app") == "$project" ]] || exit 1
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$app") == app ]] || exit 1
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$app" | grep -Fxq MANGER_STORAGE=postgres
was_running=$(docker inspect --format '{{.State.Running}}' "$app")
old_tools=$(sed -n 's/^MANGER_POSTGRES_TOOLS_IMAGE=//p' "$config")
[[ $old_tools =~ ^[a-zA-Z0-9][a-zA-Z0-9./:_@-]*$ ]] || exit 1
old_tools_id=$(docker image inspect --format '{{.Id}}' "$old_tools")
old_app_id=$(docker inspect --format '{{.Image}}' "$app")
before_schema=$(schema "$old_tools")
[[ $before_schema == 3 || $before_schema == 4 ]] || { echo 'Cette commande accepte seulement les schémas 003 et 004.' >&2; exit 1; }
old_tools_schema=$(docker run --rm --network none --read-only --entrypoint node "$old_tools_id" -e 'console.log(require("./db/postgres-schema").schemaVersion)')
[[ $(systemctl --user show --property=LoadState --value manger-postgres-backup.timer) == loaded ]] || { echo 'Minuteur habituel introuvable.' >&2; exit 1; }
timer_active=0
if systemctl --user is-active --quiet manger-postgres-backup.timer; then timer_active=1; fi
run=$(mktemp -d "$private/upgrade-fdl.XXXXXX")
nonce=${run##*.}
cp -p -- "$config" "$run/instance.env.before"
docker image tag "$old_app_id" "manger:before-fdl-app-$nonce"
docker image tag "$old_tools_id" "manger:before-fdl-tools-$nonce"
printf '%s\n' "$old_app_id" > "$run/app-image-id"
printf '%s\n' "$old_tools_id" > "$run/tools-image-id"
stage='pause des sauvegardes'; stopped=0; attempted=0; timer_paused=0
finish() {
  local result=$?
  if [[ $result != 0 ]]; then
    trap - EXIT
    if [[ $stopped == 1 && $attempted == 0 && $was_running == true ]]; then compose start app || :; fi
    printf 'Mise à jour non confirmée : %s. Dossier privé : %s\n' "$stage" "$run" >&2
    if [[ $timer_paused == 1 ]]; then echo 'Minuteur laissé arrêté.' >&2; else echo 'État du minuteur non confirmé.' >&2; fi
    echo 'Après une tentative de migration, ne pas restaurer de données ni redémarrer une ancienne image à l’aveugle. Corriger puis relancer cette commande.' >&2
  fi
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
systemctl --user stop manger-postgres-backup.timer
timer_paused=1
attempts=0
while [[ $(systemctl --user show --property=ActiveState --value manger-postgres-backup.service) =~ ^(active|activating|deactivating|reloading)$ ]]; do
  [[ $attempts -lt 60 ]] || { echo 'Sauvegarde toujours en cours, aucun arrêt forcé.' >&2; exit 1; }
  sleep 2; attempts=$((attempts + 1))
done
stage='construction et contrôle des nouvelles images'
cd -- "$repo"
git diff --quiet
git diff --cached --quiet
revision=$(git rev-parse --short=12 HEAD)
candidate="manger:fdl-$revision"
tools="$candidate-tools"
docker build -t "$candidate" .
sh scripts/test-docker.sh "$candidate"
docker build -f docker/postgres-tools.Dockerfile --build-arg "MANGER_CANDIDATE_IMAGE=$candidate" -t "$tools" .
[[ $(docker run --rm --network none --read-only --entrypoint node "$tools" -e 'console.log(require("./db/postgres-schema").schemaVersion)') == 4 ]] || exit 1
if [[ -n $fdl_url ]]; then
  docker run --rm --network none --read-only --entrypoint node --env "MANGER_FDL_URL=$fdl_url" "$candidate" -e 'require("./fdl").fdlUrl(process.env)'
fi
backup_tools="manger:before-fdl-tools-$nonce"
if [[ $old_tools_schema != "$before_schema" ]]; then
  [[ $before_schema == 4 ]] || { echo 'Il faut les anciens outils du schéma 003 pour sauvegarder cette source.' >&2; exit 1; }
  backup_tools=$tools
fi
stage='arrêt applicatif et sauvegarde avant migration'
compose stop app; stopped=1
instance "$backup_tools" backup "/archives/before-fdl-$nonce" > "$run/before-backup.json"
instance "$backup_tools" verify "/archives/before-fdl-$nonce" > "$run/before-verify.json"
stage='migration transactionnelle 004'; attempted=1
MANGER_POSTGRES_TOOLS_IMAGE="$tools" compose --profile maintenance run --rm --no-deps -T --pull never --entrypoint node instance postgres-schema.js --apply > "$run/migration.json"
[[ $(schema "$tools") == 4 ]] || exit 1
stage='configuration des images et sauvegarde après migration'
sed -e "s|^MANGER_CANDIDATE_IMAGE=.*|MANGER_CANDIDATE_IMAGE=$candidate|" \
    -e "s|^MANGER_POSTGRES_TOOLS_IMAGE=.*|MANGER_POSTGRES_TOOLS_IMAGE=$tools|" "$config" > "$run/instance.env.new"
if [[ -n $fdl_url ]]; then
  sed -i '/^MANGER_FDL_URL=/d' "$run/instance.env.new"
  printf 'MANGER_FDL_URL=%s\n' "$fdl_url" >> "$run/instance.env.new"
fi
chmod 600 "$run/instance.env.new"
mv -T -- "$run/instance.env.new" "$config"
compose config --quiet
instance "$tools" backup "/archives/after-fdl-$nonce" > "$run/after-backup.json"
instance "$tools" verify "/archives/after-fdl-$nonce" > "$run/after-verify.json"
stage='démarrage et santé de la nouvelle application'
compose up -d --no-deps --no-build --pull never --wait --wait-timeout 90 app
compose exec -T app node healthcheck.js
stage='vérification de la sauvegarde automatique'
systemctl --user reset-failed manger-postgres-backup.service
systemctl --user start manger-postgres-backup.service
if [[ $timer_active == 1 ]]; then systemctl --user start manger-postgres-backup.timer; fi
compose ps
echo 'Migration 004 et application confirmées ; PostgreSQL, volumes, comptes et certificats conservés.'
printf 'Configuration précédente et résultats privés : %s\n' "$run"
if [[ $timer_active == 1 ]]; then echo 'Minuteur quotidien repris.'; else echo 'Minuteur initialement inactif, laissé inactif.'; fi
