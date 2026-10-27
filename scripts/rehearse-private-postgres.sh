#!/usr/bin/env bash
# Private rehearsal only: preserve the source container, volumes and all recovery files.
set -euo pipefail
umask 077
image=${1:?Usage: bash scripts/rehearse-private-postgres.sh image-candidate image-outils}
tools=${2:?Image outils requise}
[[ $# == 2 && $(uname -s) == Linux ]] || exit 1
command -v openssl >/dev/null
[[ $(docker info --format '{{.OSType}}') == linux ]] || exit 1
repo=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
parent=$(cd -- "$repo/.." && pwd -P)
project=manger-postgres-validation
private="$parent/$project-private"
[[ ! -e $private && ! -L $private ]] || { echo 'Dossier privé déjà présent : conserver les fichiers, arrêt.' >&2; exit 1; }
docker image inspect "$image" "$tools" >/dev/null
source_id=$(docker inspect --type container --format '{{.Id}}' manger-manger-1)
for label in com.docker.compose.project com.docker.compose.service; do
  [[ $(docker inspect --format "{{index .Config.Labels \"$label\"}}" "$source_id") == manger ]] || exit 1
done
source_engine=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$source_id" | sed -n 's/^MANGER_STORAGE=//p')
[[ -z $source_engine || $source_engine == sqlite ]] || { echo 'La source attendue doit utiliser SQLite.' >&2; exit 1; }
source_running=$(docker inspect --format '{{.State.Running}}' "$source_id")
[[ $source_running == true || $source_running == false ]] || exit 1
volumes=$(docker volume ls --format '{{.Name}}')
networks=$(docker network ls --format '{{.Name}}')
for name in "${project}_postgres-data" "${project}_runtime-data"; do
  if printf '%s\n' "$volumes" | grep -Fxq "$name"; then echo 'Volume de répétition déjà présent : arrêt.' >&2; exit 1; fi
done
for name in "${project}_backend" "${project}_outbound"; do
  if printf '%s\n' "$networks" | grep -Fxq "$name"; then echo 'Réseau de répétition déjà présent : arrêt.' >&2; exit 1; fi
done
project_containers=$(docker ps --all --quiet --filter "label=com.docker.compose.project=$project")
[[ -z $project_containers ]] || exit 1
for file in server.crt server.key ca.crt; do [[ -f $repo/tls/server/$file && -r $repo/tls/server/$file ]] || exit 1; done
mkdir -- "$private"
mkdir -- "$private/secrets" "$private/pki" "$private/source" "$private/archives" "$private/original"
stage='préparation privée'
restart_source=0
restore_source() {
  [[ $restart_source == 1 ]] || return 0
  docker start "$source_id" > "$private/source-start.log" 2>&1 || return 1
  for ((attempt=0; attempt<20; attempt++)); do
    if docker exec "$source_id" node healthcheck.js > "$private/source-health.log" 2>&1; then restart_source=0; return 0; fi
    sleep 1
  done
  return 1
}
finish() {
  result=$?
  trap - EXIT HUP INT TERM
  if ! restore_source; then
    echo 'Reprise SQLite non confirmée : vérifier le conteneur manger-manger-1 avant de continuer.' >&2
    result=1
  fi
  if [[ $result != 0 ]]; then
    echo "Arrêt : $stage (code $result). Fichiers privés conservés dans $private ; ne pas les publier." >&2
  fi
  exit "$result"
}
trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
export MANGER_CANDIDATE_IMAGE="$image" MANGER_POSTGRES_TOOLS_IMAGE="$tools"
export MANGER_PG_SECRETS_DIR="$private/secrets" MANGER_PG_SOURCE_DIR="$private/source" MANGER_PG_ARCHIVE_DIR="$private/archives"
export MANGER_WEB_TLS_DIR="$repo/tls/server" MANGER_INSTANCE_BIND_ADDRESS=127.0.0.1 MANGER_INSTANCE_PORT=0
export MANGER_MAINTENANCE_UID="$(id -u)" MANGER_MAINTENANCE_GID="$(id -g)"
export MANGER_SMTP_HOST='' MANGER_SMTP_FROM='' MANGER_SMTP_USER='' MANGER_SMTP_PASSWORD='' MANGER_APP_URL=''
export MANGER_SMTP_PORT=587
pgc() { docker compose --project-name "$project" --env-file "$private/instance.env" --file "$repo/compose.postgres.yaml" --file "$repo/compose.postgres.instance.yaml" "$@"; }
report() {
  expected=$1; file=$2
  grep -Eq "\"status\"[[:space:]]*:[[:space:]]*\"$expected\"" "$file"
  grep -Eq '"tables"[[:space:]]*:[[:space:]]*22([,}]|[[:space:]])' "$file"
}
printf '%s\n' "$source_id" > "$private/original/container-id.txt"
printf '%s\n' "$source_running" > "$private/original/was-running.txt"
docker inspect --format '{{.Image}}' "$source_id" > "$private/original/image-id.txt"
for file in compose.yaml compose.override.yaml compose.override.yml .env; do
  if [[ -f $repo/$file ]]; then cp -p -- "$repo/$file" "$private/original/$file"; fi
done
cp -a -- "$repo/tls" "$private/original/tls"
openssl verify -CAfile "$repo/tls/server/ca.crt" -verify_ip 127.0.0.1 "$repo/tls/server/server.crt" > "$private/web-certificate.log" 2>&1
for role in app migration bootstrap; do openssl rand -hex 32 > "$private/secrets/$role-password"; done
{
  openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 -subj /CN=MangerPostgresCA \
    -addext basicConstraints=critical,CA:TRUE,pathlen:0 -addext keyUsage=critical,keyCertSign,cRLSign \
    -keyout "$private/pki/ca.key" -out "$private/secrets/ca.crt"
  openssl req -new -newkey rsa:2048 -nodes -sha256 -subj /CN=postgres \
    -keyout "$private/secrets/server.key" -out "$private/pki/server.csr"
  printf '%s\n' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature,keyEncipherment' \
    'extendedKeyUsage=serverAuth' 'subjectAltName=DNS:postgres,DNS:localhost,IP:127.0.0.1' > "$private/pki/server.ext"
  openssl x509 -req -in "$private/pki/server.csr" -CA "$private/secrets/ca.crt" -CAkey "$private/pki/ca.key" \
    -set_serial "0x$(openssl rand -hex 16)" -days 365 -sha256 -extfile "$private/pki/server.ext" -out "$private/secrets/server.crt"
} > "$private/pki/openssl.log" 2>&1
chmod 0444 "$private/secrets/"*
printf '%s\n' "MANGER_CANDIDATE_IMAGE=$image" "MANGER_POSTGRES_TOOLS_IMAGE=$tools" \
  "MANGER_PG_SECRETS_DIR=$private/secrets" "MANGER_PG_SOURCE_DIR=$private/source" "MANGER_PG_ARCHIVE_DIR=$private/archives" \
  "MANGER_WEB_TLS_DIR=$repo/tls/server" 'MANGER_INSTANCE_BIND_ADDRESS=127.0.0.1' 'MANGER_INSTANCE_PORT=0' \
  "MANGER_MAINTENANCE_UID=$(id -u)" "MANGER_MAINTENANCE_GID=$(id -g)" \
  'MANGER_SMTP_HOST=' 'MANGER_SMTP_PASSWORD=' 'MANGER_SMTP_USER=' 'MANGER_SMTP_FROM=' 'MANGER_APP_URL=' > "$private/instance.env"
stage='copie arrêtée et reprise SQLite'
echo 'Copie privée : arrêt SQLite uniquement pendant la copie, puis reprise de son état initial.'
copy_started=$(date +%s)
if [[ $source_running == true ]]; then restart_source=1; docker stop "$source_id" > "$private/source-stop.log" 2>&1; fi
docker cp "$source_id:/data/." "$private/source/" > "$private/copy.log" 2>&1
restore_source
copy_seconds=$(( $(date +%s) - copy_started ))
[[ -f $private/source/manger.db && -f $private/source/accounts.db ]] || exit 1
(cd "$private/source"; sha256sum manger.db accounts.db > ../source.sha256)
stage='analyse des copies figées'
docker run --rm --read-only --network none --tmpfs /tmp --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges --mount "type=bind,src=$private/source,dst=/source,readonly" \
  --entrypoint node "$image" migration-source.js /source/manger.db /source/accounts.db --source-stopped \
  > "$private/analysis.json" 2> "$private/analysis.error.log"
stage='import PostgreSQL dans la cible neuve'
pgc --profile maintenance config --quiet > "$private/config.log" 2>&1
pgc up -d --wait --wait-timeout 90 postgres > "$private/postgres-start.log" 2>&1
import_started=$(date +%s)
pgc run --rm --no-deps -T migrate import /source/manger.db /source/accounts.db --source-stopped --target-empty \
  > "$private/import.json" 2> "$private/import.error.log"
report ready "$private/import.json"
import_seconds=$(( $(date +%s) - import_started ))
stage='archive administrative privée'
pgc --profile maintenance run --rm --no-deps -T instance backup /archives/after-import > "$private/backup.json" 2> "$private/backup.error.log"
report backed-up "$private/backup.json"
pgc --profile maintenance run --rm --no-deps -T instance verify /archives/after-import > "$private/verify.json" 2> "$private/verify.error.log"
report verified-open "$private/verify.json"
stage='santé du web privé HTTPS'
pgc up -d --no-build --wait --wait-timeout 90 app > "$private/app-start.log" 2>&1
pgc exec -T app node healthcheck.js > "$private/app-health.log" 2>&1
(cd "$private/source"; sha256sum -c ../source.sha256) > "$private/source-check.log"
printf 'copy_and_restart_seconds=%s\nimport_seconds=%s\n' "$copy_seconds" "$import_seconds" > "$private/measurements.txt"
du -sk "$private/source" "$private/archives" >> "$private/measurements.txt"
echo 'Répétition privée terminée : 22 tables comparées, archive vérifiée et copie SQLite figée conservée.'
echo "Source SQLite : état initial conservé. Projet séparé : $project."
echo "Copie/reprise : $copy_seconds s ; import : $import_seconds s."
echo "Dossier privé : $private (ne pas publier son contenu)."
pgc port app 3000
