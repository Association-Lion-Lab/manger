#!/bin/sh
# Run against a newly built image, never against a Compose service or real volume.
set -eu
image=${1:-manger:0.1.0}
container=''
cleanup() {
  if [ -n "$container" ]; then docker rm -fv "$container" >/dev/null; fi
}
trap cleanup 0
trap 'exit 1' HUP INT TERM

container=$(docker create --network none --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges --init \
  --health-interval 1s --health-start-period 1s --health-retries 10 "$image")

wait_healthy() {
  attempts=0
  while [ "$attempts" -lt 30 ]; do
    state=$(docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' "$container")
    case "$state" in
      'running healthy') return 0 ;;
      'exited '*|'dead '*|'running unhealthy') break ;;
    esac
    attempts=$((attempts + 1))
    sleep 1
  done
  docker logs --tail 80 "$container"
  echo 'Image non saine : déploiement refusé.' >&2
  return 1
}

docker start "$container" >/dev/null
wait_healthy
docker exec "$container" node image-check.js
docker exec "$container" node -e '
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  assert.notEqual(process.getuid(), 0);
  assert.equal(fs.statSync("/app/server.js").uid, 0);
  for (const file of fs.readdirSync("/app")) {
    assert.ok(["public", "node_modules", "package.json", "package-lock.json", "LICENSE"].includes(file) || (file.endsWith(".js") && !file.endsWith(".test.js")), file);
  }
  const { DatabaseSync } = require("node:sqlite");
  for (const name of ["manger.db", "accounts.db"]) {
    const db = new DatabaseSync(`/data/${name}`);
    db.exec("CREATE TABLE deployment_probe(value TEXT)");
    db.prepare("INSERT INTO deployment_probe VALUES (?)").run("persisted");
    db.close();
  }
  (async () => {
    const base = "http://127.0.0.1:3000";
    for (const path of ["/api/health", "/", "/apple-touch-icon.png", "/manifest.webmanifest"]) {
      assert.equal((await fetch(base + path, { signal: AbortSignal.timeout(5000) })).status, 200, path);
    }
    assert.equal((await fetch(base + "/api/recipes", { signal: AbortSignal.timeout(5000) })).status, 401);
  })().catch(error => { console.error(error); process.exitCode = 1; });
'
docker restart "$container" >/dev/null
wait_healthy
docker exec "$container" node -e '
  const assert = require("node:assert/strict");
  const { DatabaseSync } = require("node:sqlite");
  for (const name of ["manger.db", "accounts.db"]) {
    const db = new DatabaseSync(`/data/${name}`);
    assert.equal(db.prepare("SELECT value FROM deployment_probe").get().value, "persisted");
    assert.equal(db.prepare("PRAGMA quick_check").get().quick_check, "ok");
    db.close();
  }
'
echo 'Image vérifiée : démarrage, santé, accès, icône et persistance des deux bases après redémarrage.'
