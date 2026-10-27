#!/usr/bin/env bash
# Only for the explicitly disposable SQLite test data; no reimport or volume deletion.
set -euo pipefail
umask 077
[[ $# == 2 && $2 == --test-data-only && $(uname -s) == Linux ]] || { echo 'Usage : bash scripts/promote-postgres-test-instance.sh IP_LAN --test-data-only' >&2; exit 1; }
address=$1
[[ $address =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || exit 1
[[ $address == 10.* || $address == 192.168.* || $address =~ ^172\.(1[6-9]|2[0-9]|3[01])\. ]] || exit 1
[[ $(docker info --format '{{.OSType}}') == linux ]] || exit 1
repo=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
parent=$(cd -- "$repo/.." && pwd -P)
project=manger-postgres-validation
private="$parent/$project-private"
operation="$private/promotion"
[[ -d $private && ! -L $private && -f $private/instance.env && ! -e $operation && ! -L $operation ]] || { echo 'Copie validée requise et promotion non encore exécutée : arrêt.' >&2; exit 1; }
source_id=$(cat "$private/original/container-id.txt")
current_source=$(docker inspect --type container --format '{{.Id}}' manger-manger-1)
[[ -n $source_id && $source_id == "$current_source" ]] || exit 1
for label in com.docker.compose.project com.docker.compose.service; do
  [[ $(docker inspect --format "{{index .Config.Labels \"$label\"}}" "$source_id") == manger ]] || exit 1
done
source_engine=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$source_id" | sed -n 's/^MANGER_STORAGE=//p')
[[ -z $source_engine || $source_engine == sqlite ]] || exit 1
local_addresses=$(ip -4 -o addr show scope global)
printf '%s\n' "$local_addresses" | grep -Fq -- " $address/"
openssl verify -CAfile "$repo/tls/server/ca.crt" -verify_ip "$address" "$repo/tls/server/server.crt" >/dev/null
# Ambient MANGER variables must not silently override the saved private configuration.
while IFS='=' read -r setting ignored; do
  if [[ $setting =~ ^MANGER_[A-Z0-9_]+$ ]]; then unset "$setting"; fi
done < "$private/instance.env"
export MANGER_PG_SECRETS_DIR="$private/secrets" MANGER_PG_SOURCE_DIR="$private/source" MANGER_PG_ARCHIVE_DIR="$private/archives"
export MANGER_WEB_TLS_DIR="$repo/tls/server"
settings="$private/instance.env"
pgc() { docker compose --project-name "$project" --env-file "$settings" --file "$repo/compose.postgres.yaml" --file "$repo/compose.postgres.instance.yaml" "$@"; }
for key in MANGER_INSTANCE_BIND_ADDRESS MANGER_INSTANCE_PORT MANGER_APP_URL; do
  occurrences=$(grep -c "^$key=" "$settings")
  [[ $occurrences == 1 ]] || exit 1
done
pgc exec -T app node healthcheck.js >/dev/null
mkdir -- "$operation"
stage='préparation de la bascule'
finish() {
  result=$?
  trap - EXIT HUP INT TERM
  if [[ $result != 0 ]]; then
    echo "Arrêt : $stage (code $result). Journaux privés : $operation ; ne pas les publier." >&2
    echo 'Aucun retour SQLite automatique : contrôler les conteneurs avant toute reprise. Ne pas relancer ce script.' >&2
  fi
  exit "$result"
}
trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
cp -p -- "$settings" "$operation/instance.before.env"
awk -v address="$address" '
  /^MANGER_INSTANCE_BIND_ADDRESS=/ {$0="MANGER_INSTANCE_BIND_ADDRESS=" address}
  /^MANGER_INSTANCE_PORT=/ {$0="MANGER_INSTANCE_PORT=3000"}
  /^MANGER_APP_URL=/ {$0="MANGER_APP_URL=https://" address ":3000"}
  {print}
' "$settings" > "$operation/instance.next.env"
settings="$operation/instance.next.env"
pgc --profile maintenance config --quiet > "$operation/config.log" 2>&1
settings="$private/instance.env"
stage='archive PostgreSQL récente avant exposition LAN'
echo 'Sauvegarde du PostgreSQL actuel, comptes et données de la copie conservés.'
pgc stop app > "$operation/stop-private-web.log" 2>&1
pgc --profile maintenance run --rm --no-deps -T instance backup /archives/before-lan > "$operation/backup.json" 2> "$operation/backup.error.log"
pgc --profile maintenance run --rm --no-deps -T instance verify /archives/before-lan > "$operation/verify.json" 2> "$operation/verify.error.log"
for check in 'backup.json:backed-up' 'verify.json:verified-open'; do
  file=${check%%:*}; expected=${check#*:}
  grep -Eq "\"status\"[[:space:]]*:[[:space:]]*\"$expected\"" "$operation/$file"
  grep -Eq '"tables"[[:space:]]*:[[:space:]]*22([,}]|[[:space:]])' "$operation/$file"
done
stage='arrêt de l’ancien serveur SQLite'
docker stop "$source_id" > "$operation/stop-sqlite.log" 2>&1
[[ $(docker inspect --format '{{.State.Running}}' "$source_id") == false ]] || exit 1
cp -- "$operation/instance.next.env" "$private/instance.env.next"
mv -T -- "$private/instance.env.next" "$private/instance.env"
stage='démarrage PostgreSQL sur le port3000'
# An attempted LAN opening can already receive writes: never auto-restart old SQLite.
pgc up -d --no-build --no-deps --wait --wait-timeout 90 app > "$operation/start-web.log" 2>&1
pgc exec -T app node healthcheck.js > "$operation/health.log" 2>&1
pgc ps > "$operation/containers.log" 2>&1
printf 'postgres-lan\n' > "$operation/state.txt"
echo "PostgreSQL disponible : https://$address:3000"
echo 'Ancien conteneur SQLite arrêté ; son volume, les copies et les certificats sont conservés.'
echo 'Même projet PostgreSQL et mêmes comptes ; connexion et parcours iPhone à vérifier.'
