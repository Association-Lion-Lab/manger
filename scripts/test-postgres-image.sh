#!/bin/sh
# Only fresh, labelled test resources. Never replace an existing Compose service.
set -eu
umask 077
image=${1:?Usage: sh scripts/test-postgres-image.sh image-candidate [image-outils [--admin-https]]}
[ "$#" -le 3 ] || exit 1
tools_image=${2:-}
admin_https=${3:-}
if [ "$#" -ge 2 ]; then [ -n "$tools_image" ] || exit 1; fi
if [ "$#" -eq 3 ]; then [ "$admin_https" = --admin-https ] || exit 1; fi
[ "$(uname -s)" = Linux ] || { echo 'Ce scénario exige Docker Linux.' >&2; exit 1; }
command -v openssl >/dev/null
[ "$(docker info --format '{{.OSType}}')" = linux ] || exit 1
docker compose version
docker image inspect "$image" >/dev/null
if [ -n "$tools_image" ]; then docker image inspect "$tools_image" >/dev/null; fi
repo=$(CDPATH= cd "$(dirname "$0")/.." && pwd -P)
parent=$(CDPATH= cd "${TMPDIR:-/tmp}" && pwd -P)
work=$(mktemp -d "$parent/manger-pg-test.XXXXXX")
project="manger-pg-test-$(date +%s)-$$"
token=$(openssl rand -hex 16)
printf '%s' "$token" > "$work/.owner"
export MANGER_CANDIDATE_IMAGE="$image" MANGER_TEST_TOKEN="$token"
export MANGER_PG_SECRETS_DIR="$work/secrets" MANGER_PG_SOURCE_DIR="$work/source"
export MANGER_POSTGRES_TOOLS_IMAGE="$tools_image" MANGER_PG_ARCHIVE_DIR="$work/archives"
export MANGER_TEST_UID="$(id -u)" MANGER_TEST_GID="$(id -g)"
export MANGER_MAINTENANCE_UID="$MANGER_TEST_UID" MANGER_MAINTENANCE_GID="$MANGER_TEST_GID"
export MANGER_WEB_TLS_DIR="$work/secrets" MANGER_INSTANCE_BIND_ADDRESS=127.0.0.1 MANGER_INSTANCE_PORT=0
# Explicit empty values override any private SMTP settings in the repository's .env.
export MANGER_SMTP_HOST='' MANGER_SMTP_FROM='' MANGER_SMTP_USER='' MANGER_SMTP_PASSWORD='' MANGER_APP_URL=''
export MANGER_SMTP_PORT=587
compose() {
  if [ -n "$admin_https" ]; then
    docker compose --project-name "$project" --file "$repo/compose.postgres.yaml" --file "$repo/compose.postgres.instance.yaml" --file "$repo/compose.postgres-rehearsal.yaml" --profile instance-rehearsal "$@"
  elif [ -n "$tools_image" ]; then
    docker compose --project-name "$project" --file "$repo/compose.postgres.yaml" --file "$repo/compose.postgres-rehearsal.yaml" --profile instance-rehearsal "$@"
  else docker compose --project-name "$project" --file "$repo/compose.postgres.yaml" "$@"; fi
}
probe_source() {
  if [ -n "$admin_https" ]; then
    docker exec -i -e MANGER_PROBE_MODE="$1" -e MANGER_PROBE_HTTPS=1 -e NODE_EXTRA_CA_CERTS=/run/secrets/web_tls_ca "$app" node < "$repo/scripts/postgres-image-probe.js"
  else docker exec -i -e MANGER_PROBE_MODE="$1" "$app" node < "$repo/scripts/postgres-image-probe.js"; fi
}
instance() { host=$1; shift; compose run --rm --no-deps -T -e MANGER_PG_HOST="$host" instance "$@"; }
instance_status() {
  expected=$1; shift
  instance "$@" > "$work/instance-result.json"
  grep -Fq "\"status\":\"$expected\"" "$work/instance-result.json" || { echo 'État administrateur inattendu.' >&2; return 1; }
  cat "$work/instance-result.json"
}
started=0
stage='préparation du scénario'
owned() {
  volumes=$(docker volume ls --format '{{.Name}}') || return 1
  networks=$(docker network ls --format '{{.Name}}') || return 1
  for volume in "${project}_postgres-data" "${project}_runtime-data" "${project}_recovery-data" "${project}_recovery-runtime"; do
    if printf '%s\n' "$volumes" | grep -Fxq "$volume"; then
      saved=$(docker volume inspect --format '{{index .Labels "org.manger.test-token"}}' "$volume") || return 1
      [ "$saved" = "$token" ] || return 1
    fi
  done
  for network in "${project}_backend" "${project}_outbound"; do
    if printf '%s\n' "$networks" | grep -Fxq "$network"; then
      saved=$(docker network inspect --format '{{index .Labels "org.manger.test-token"}}' "$network") || return 1
      [ "$saved" = "$token" ] || return 1
    fi
  done
  containers=$(compose ps --all --quiet) || return 1
  for container in $containers; do
    saved=$(docker inspect --format '{{index .Config.Labels "org.manger.test-token"}}' "$container") || return 1
    [ "$saved" = "$token" ] || return 1
  done
}
cleanup() {
  code=$?
  trap - 0 HUP INT TERM
  if [ "$code" -ne 0 ]; then echo "Arrêt du scénario : $stage (code $code)." >&2; fi
  if [ "$started" -eq 1 ]; then
    if owned; then
      if [ "$code" -ne 0 ] && ! compose logs --no-color > "$work/compose.log" 2>&1; then
        echo 'Journaux non récupérés : ressources de test conservées pour diagnostic.' >&2
        code=1
      else compose down --volumes --timeout 20 >/dev/null || code=1; fi
    else echo 'Nettoyage refusé : ressources non reconnues, aucune suppression.' >&2; code=1; fi
  fi
  if [ "$code" -eq 0 ] && [ ! -L "$work" ] && [ "$(dirname "$work")" = "$parent" ] && [ "$(cat "$work/.owner")" = "$token" ]; then
    case "$(basename "$work")" in manger-pg-test.*) rm -rf -- "$work" ;; *) code=1 ;; esac
  fi
  if [ "$code" -ne 0 ]; then echo "Échec : diagnostic conservé dans le dossier privé $work ; ne pas publier ses secrets." >&2; fi
  exit "$code"
}
trap cleanup 0
trap 'echo "Signal HUP reçu." >&2; exit 129' HUP
trap 'echo "Signal INT reçu." >&2; exit 130' INT
trap 'echo "Signal TERM reçu." >&2; exit 143' TERM
echo "Projet de test : $project"
mkdir "$work/pki" "$work/secrets" "$work/source" "$work/archives"
stage='préparation TLS et secrets de test'
echo 'Préparation du TLS et des secrets de test.'
for role in app migration bootstrap; do openssl rand -hex 32 > "$work/secrets/$role-password"; done
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 1 -subj /CN=MangerPostgresTestCA \
  -addext basicConstraints=critical,CA:TRUE,pathlen:0 -addext keyUsage=critical,keyCertSign,cRLSign \
  -keyout "$work/pki/ca.key" -out "$work/secrets/ca.crt" > "$work/tls.log" 2>&1
openssl req -new -newkey rsa:2048 -nodes -sha256 -subj /CN=postgres \
  -keyout "$work/secrets/server.key" -out "$work/pki/server.csr" >> "$work/tls.log" 2>&1
printf '%s\n' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature,keyEncipherment' \
  'extendedKeyUsage=serverAuth' 'subjectAltName=DNS:postgres,DNS:postgres-recovery,DNS:localhost,IP:127.0.0.1' > "$work/pki/server.ext"
openssl x509 -req -in "$work/pki/server.csr" -CA "$work/secrets/ca.crt" -CAkey "$work/pki/ca.key" \
  -set_serial "0x$(openssl rand -hex 16)" -days 1 -sha256 -extfile "$work/pki/server.ext" \
  -out "$work/secrets/server.crt" >> "$work/tls.log" 2>&1
# Secret files are bind-mounted individually; their host parents remain 0700.
chmod 0444 "$work/secrets/"*
stage='création des copies SQLite synthétiques'
echo 'Création des seules copies SQLite synthétiques.'
docker run --rm -i --network none --read-only --tmpfs /tmp --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges --mount "type=bind,src=$work/source,dst=/source" \
  --entrypoint node "$image" < "$repo/scripts/postgres-test-source.js"
chmod 0444 "$work/source/manger.db" "$work/source/accounts.db"
stage='validation Compose et absence de ressources préexistantes'
compose config --quiet
volumes=$(docker volume ls --format '{{.Name}}')
networks=$(docker network ls --format '{{.Name}}')
for resource in "${project}_postgres-data" "${project}_runtime-data" "${project}_recovery-data" "${project}_recovery-runtime"; do
  if printf '%s\n' "$volumes" | grep -Fxq "$resource"; then echo 'Volume déjà présent : refus.' >&2; exit 1; fi
done
for resource in "${project}_backend" "${project}_outbound"; do
  if printf '%s\n' "$networks" | grep -Fxq "$resource"; then echo 'Réseau déjà présent : refus.' >&2; exit 1; fi
done
containers=$(compose ps --all --quiet)
[ -z "$containers" ] || { echo 'Projet déjà présent : refus.' >&2; exit 1; }
stage='démarrage et santé PostgreSQL'
started=1
compose up -d postgres
wait_healthy() {
  service=$1
  attempts=0
  while [ "$attempts" -lt 90 ]; do
    container=$(compose ps --all --quiet "$service")
    [ -n "$container" ] || return 1
    state=$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container")
    case "$state" in 'running healthy') return 0 ;; 'exited '*|'dead '*) break ;; esac
    attempts=$((attempts + 1)); sleep 1
  done
  echo "Service de test non sain : $service. Déploiement refusé." >&2
  return 1
}
wait_healthy postgres
pg=$(compose ps --quiet postgres)
stage='contrôle du bootstrap et des journaux'
echo 'Refus du bootstrap répété et contrôle des journaux.'
if docker exec "$pg" /bin/sh /docker-entrypoint-initdb.d/10-manger.sh > "$work/init-failure.log" 2>&1; then
  echo 'Le bootstrap a réutilisé des rôles existants : refus.' >&2; exit 1
fi
docker logs "$pg" > "$work/postgres.log" 2>&1
cat "$work/secrets/app-password" "$work/secrets/migration-password" "$work/secrets/bootstrap-password" > "$work/password-patterns"
result=0
grep -F -f "$work/password-patterns" "$work/postgres.log" "$work/init-failure.log" >/dev/null 2>&1 || result=$?
case "$result" in 1) : ;; 0) echo 'Secret détecté dans un journal, test refusé (valeur masquée).' >&2; exit 1 ;; *) echo 'Contrôle des journaux impossible.' >&2; exit 1 ;; esac
stage='vérification TLS positive et négative'
echo 'TLS : réussite normale et refus des CA ou nom incorrects.'
compose run --rm --no-deps --entrypoint node migrate -e '
const assert=require("node:assert/strict"),{openPostgres}=require("./db/postgres");
(async()=>{const config=require("./db/config").postgresConfig(process.env,{administrative:true});
const db=await openPostgres(config);try{assert.equal((await db.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")).rows[0].ssl,true);}finally{await db.close();}
await assert.rejects(openPostgres({...config,ssl:{ca:require("node:tls").rootCertificates[0]}}),e=>["SELF_SIGNED_CERT_IN_CHAIN","UNABLE_TO_VERIFY_LEAF_SIGNATURE","UNABLE_TO_GET_ISSUER_CERT_LOCALLY"].includes(e.cause?.code));
await assert.rejects(openPostgres({...config,host:"postgres-wrong-name"}),e=>e.cause?.code==="ERR_TLS_CERT_ALTNAME_INVALID");
console.log("TLS vérifié et erreurs d’identité refusées.");})().catch(error=>{console.error("Contrôle TLS refusé :",error.code||"verification",error.cause?.code||"");process.exitCode=1;});'
stage='commande de transfert des 22 tables'
echo 'Transfert synthétique des 22 tables.'
compose run --rm --no-deps migrate import /source/manger.db /source/accounts.db --source-stopped --target-empty
echo 'Commande de transfert terminée avec le code 0.'
stage='démarrage et santé de l’application'
echo 'Démarrage du candidat applicatif.'
compose up -d app
wait_healthy app
app=$(compose ps --quiet app)
stage='retour SQLite avant les nouvelles écritures'
echo 'Arrêt du candidat : vérification du retour aux copies SQLite synthétiques.'
compose stop app postgres
app_exit=$(docker inspect --format '{{.State.ExitCode}}' "$app")
[ "$app_exit" = 0 ] || { echo 'Arrêt applicatif non propre avant retour SQLite.' >&2; exit 1; }
docker run --rm -i --network none --read-only --tmpfs /tmp --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges --mount "type=bind,src=$work/source,dst=/source,readonly" \
  -e MANGER_PROBE_MODE=sqlite-return --entrypoint node "$image" < "$repo/scripts/postgres-image-probe.js"
stage='reprise du candidat après contrôle SQLite'
compose start postgres
wait_healthy postgres
compose start app
wait_healthy app
if [ -n "$tools_image" ]; then
  stage='archive administrative avant les nouvelles écritures'
  compose stop app
  [ "$(docker inspect --format '{{.State.ExitCode}}' "$app")" = 0 ] || exit 1
  instance_status backed-up postgres backup /archives/before-writes
  instance_status verified-open postgres verify /archives/before-writes
  compose start app
  wait_healthy app
fi
stage='écritures HTTP et sauvegarde synthétiques'
probe_source write
stage='recréation des deux conteneurs'
echo 'Recréation réelle des deux conteneurs, volumes conservés.'
compose stop app postgres
app_exit=$(docker inspect --format '{{.State.ExitCode}}' "$app")
[ "$app_exit" = 0 ] || { echo 'Arrêt applicatif non propre.' >&2; exit 1; }
compose rm -f app postgres
compose up -d postgres
wait_healthy postgres
compose up -d app
wait_healthy app
app=$(compose ps --quiet app)
stage='contrôle de persistance après recréation'
probe_source verify
stage='coupure et reprise PostgreSQL'
echo 'Coupure PostgreSQL et reprise du même processus applicatif.'
started_at=$(docker inspect --format '{{.State.StartedAt}}' "$app")
compose stop postgres
if docker exec "$app" node healthcheck.js >/dev/null 2>&1; then echo 'Santé incorrectement positive pendant la panne.' >&2; exit 1; fi
compose start postgres
wait_healthy postgres
wait_healthy app
docker exec "$app" node healthcheck.js
[ "$(compose ps --quiet app)" = "$app" ] && [ "$(docker inspect --format '{{.State.StartedAt}}' "$app")" = "$started_at" ] || { echo 'Application relancée au lieu de reprendre sa connexion.' >&2; exit 1; }
if [ -n "$tools_image" ]; then
  stage='refus de l’ancienne référence et archive récente'
  echo 'Archive complète : refus de la référence ancienne après nouvelles écritures.'
  compose stop app
  [ "$(docker inspect --format '{{.State.ExitCode}}' "$app")" = 0 ] || exit 1
  result=0
  instance postgres verify /archives/before-writes > "$work/old-archive-refusal.log" 2>&1 || result=$?
  [ "$result" = 1 ] && grep -Fq MANGER_INSTANCE_MISMATCH "$work/old-archive-refusal.log" || { echo 'Refus différent de la divergence attendue.' >&2; exit 1; }
  instance_status backed-up postgres backup /archives/after-writes
  instance_status verified-open postgres verify /archives/after-writes
  stage='restauration complète vers le secours neuf'
  recovery_started=$(date +%s)
  compose up -d postgres-recovery
  wait_healthy postgres-recovery
  instance_status verified-closed postgres-recovery restore /archives/after-writes --trusted-backup --target-empty --writers-stopped
  instance_status verified-closed postgres-recovery verify /archives/after-writes
  compose run --rm --no-deps -T --entrypoint node app-recovery -e '
const assert=require("node:assert/strict");
(async()=>{await assert.rejects(require("./db/postgres").openPostgres(require("./db/config").postgresConfig(process.env)),{code:"42501"});console.log("Accès applicatif fermé avant ouverture explicite.");})().catch(()=>{console.error("Fermeture du secours non confirmée.");process.exitCode=1;});'
  stage='ouverture du secours et vérification HTTP'
  instance_status ready postgres-recovery open /archives/after-writes --writers-stopped
  compose up -d app-recovery
  wait_healthy app-recovery
  recovery_app=$(compose ps --quiet app-recovery)
  docker exec -i -e MANGER_PROBE_MODE=recovered "$recovery_app" node < "$repo/scripts/postgres-image-probe.js"
  instance_status verified-open postgres verify /archives/after-writes
  echo "Reprise complète vérifiée : 22 tables, session, photos et nouvelle identité ; source conservée. Durée secours synthétique : $(($(date +%s) - recovery_started)) s."
  du -sk "$work/archives"
fi
stage='refus de migration absente'
echo 'Refus d’une image amputée de sa migration.'
result=0
docker run --rm --network none --user 0 --entrypoint node "$image" -e '
const fs=require("node:fs");fs.renameSync("/app/db/migrations/003-household-restore.js","/tmp/withheld-migration.js");
try{require("./image-check").checkImage();}catch(error){if(error.code!=="MODULE_NOT_FOUND"||!error.message.includes("003-household-restore"))throw error;console.log("missing-migration-detected");process.exitCode=42;}' > "$work/missing.log" 2>&1 || result=$?
[ "$result" = 42 ] && grep -q 'missing-migration-detected' "$work/missing.log" || { echo 'Échec différent du module manquant attendu.' >&2; exit 1; }
echo 'Candidat vérifié : TLS, transfert, accès, photos, persistance, panne/reprise et image.'
if [ -n "$admin_https" ]; then echo 'Profil administrateur HTTPS vérifié sur port local temporaire ; aucune bascule.'; fi
