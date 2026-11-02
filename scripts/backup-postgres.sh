#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# == 0 && $(uname -s) == Linux ]] || exit 1
repo=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
parent=$(cd -- "$repo/.." && pwd -P)
project=manger-postgres-validation
private="$parent/$project-private"
[[ -f $private/instance.env && ! -L $private/instance.env && -f $repo/postgres-auto-backup.js ]] || exit 1
[[ $repo != *:* && $repo != *$'\n'* ]] || exit 1
grep -Fxq postgres-lan "$private/promotion/state.txt"
while IFS='=' read -r setting ignored; do
  if [[ $setting =~ ^MANGER_[A-Z0-9_]+$ ]]; then unset "$setting"; fi
done < "$private/instance.env"
export MANGER_PG_SECRETS_DIR="$private/secrets" MANGER_PG_SOURCE_DIR="$private/source" MANGER_PG_ARCHIVE_DIR="$private/archives"
export MANGER_WEB_TLS_DIR="$repo/tls/server"
compose=(docker compose --project-name "$project" --env-file "$private/instance.env" --file "$repo/compose.postgres.yaml" --file "$repo/compose.postgres.instance.yaml" --profile maintenance)
"${compose[@]}" config --quiet
# Reuse the tested tools image; load only this trusted controller from the checkout.
exec "${compose[@]}" run --rm --no-deps -T --pull never \
  --name manger-postgres-auto-backup --label org.manger.operation=automatic-backup \
  --volume "$repo/postgres-auto-backup.js:/app/postgres-auto-backup.js:ro" \
  --entrypoint node instance /app/postgres-auto-backup.js
