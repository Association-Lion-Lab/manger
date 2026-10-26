#!/bin/sh
set -eu
# Only the candidate's new PostgreSQL volume is writable here.
tls=/var/lib/postgresql/manger-tls
install -d -m 700 -o postgres -g postgres "$tls"
install -m 600 -o postgres -g postgres /run/secrets/pg_server_key "$tls/server.key"
install -m 644 -o postgres -g postgres /run/secrets/pg_server_cert "$tls/server.crt"
exec /usr/local/bin/docker-entrypoint.sh "$@"
