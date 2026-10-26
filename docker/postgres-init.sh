#!/bin/sh
(
set -eu
# Runs only in a fresh cluster, as the official bootstrap administrator.
# Secrets are read by PostgreSQL, never placed in psql arguments or printed.
psql --no-psqlrc --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 <<'SQL'
\set VERBOSITY terse
\set SHOW_CONTEXT never
\set ECHO none
\set ECHO_HIDDEN off
DO $guard$
BEGIN
  IF btrim(pg_read_file('/run/secrets/pg_app_password'),E'\r\n') !~ '^[a-f0-9]{64}$'
    OR btrim(pg_read_file('/run/secrets/pg_migration_password'),E'\r\n') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Fresh, distinct generated role secrets required';
  END IF;
  IF btrim(pg_read_file('/run/secrets/pg_app_password'),E'\r\n') = btrim(pg_read_file('/run/secrets/pg_migration_password'),E'\r\n') THEN
    RAISE EXCEPTION 'Distinct role secrets required';
  END IF;
END;
$guard$;
SELECT format('CREATE ROLE manger_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',btrim(pg_read_file('/run/secrets/pg_migration_password'),E'\r\n')) \gexec
SELECT format('CREATE ROLE manger_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',btrim(pg_read_file('/run/secrets/pg_app_password'),E'\r\n')) \gexec
CREATE DATABASE manger OWNER manger_migrator TEMPLATE template0;
REVOKE ALL ON DATABASE manger FROM PUBLIC;
GRANT CONNECT ON DATABASE manger TO manger_app;
\connect manger
REVOKE ALL ON SCHEMA public FROM PUBLIC,manger_app;
SQL
)
