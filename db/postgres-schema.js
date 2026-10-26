const { createHash } = require('node:crypto');
const {structureFingerprint,verifyStructure}=require('./structure');
const {reservePostgresClient}=require('./postgres');
const migrations = [require('./migrations/001-initial'),require('./migrations/002-transfer-state'),require('./migrations/003-household-restore')];

// shortcut: require freshly provisioned roles; global parameter/function ACL audits belong to deployment bootstrap.
async function checkRoles(client, role) {
  const { rows: [rights] } = await client.query(`SELECT r.rolcanlogin,
    r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls AS privileged,
    EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS membership,
    EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspowner=r.oid OR
      (n.nspname NOT IN ('public','household','auth','manger_meta')
        AND has_schema_privilege(r.oid,n.oid,'CREATE'))) AS foreign_schema,
    EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owned_relation,
    r.oid=d.datdba AS app_owner, m.oid=d.datdba AS migration_owner,
    m.rolsuper OR m.rolcreatedb OR m.rolcreaterole OR m.rolreplication OR m.rolbypassrls AS privileged_migration
    FROM pg_roles r CROSS JOIN pg_database d JOIN pg_roles m ON m.rolname=current_user
    WHERE r.rolname=$1 AND d.datname=current_database()`, [role]);
  if (!rights?.rolcanlogin || rights.privileged || rights.membership || rights.app_owner || rights.foreign_schema || rights.owned_relation ||
      !rights.migration_owner || rights.privileged_migration) throw new Error('Rôles PostgreSQL non séparés ou trop privilégiés.');
}

async function history(client) {
  const { rows: [schema] } = await client.query("SELECT nspowner=current_user::regrole AS owned FROM pg_namespace WHERE nspname='manger_meta'");
  if (schema && !schema.owned) throw new Error('Historique PostgreSQL non reconnu.');
  if (!schema) {
    // Namespace dependencies include collations/operators, not just relations and functions.
    // https://www.postgresql.org/docs/18/catalog-pg-depend.html
    const { rows: [existing] } = await client.query(`SELECT
      EXISTS(SELECT 1 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema')) OR
      EXISTS(SELECT 1 FROM pg_depend WHERE refclassid='pg_namespace'::regclass AND refobjid='public'::regnamespace) AS occupied`);
    if (existing.occupied) throw new Error('Initialisation PostgreSQL refusée : cible non vide ou non reconnue.');
    await client.query(`CREATE SCHEMA manger_meta;
      CREATE TABLE manger_meta.schema_migrations (
        version integer PRIMARY KEY, name text COLLATE "C" NOT NULL, checksum text COLLATE "C" NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
  }
  const { rows } = await client.query('SELECT version,name,checksum FROM manger_meta.schema_migrations ORDER BY version');
  if (schema && rows.length === 0) throw new Error('Historique PostgreSQL incomplet ou non reconnu.');
  for (const [index, saved] of rows.entries()) {
    const expected = migrations[index];
    if (!expected || saved.version !== expected.version || saved.name !== expected.name ||
        saved.checksum !== checksum(expected.sql)) throw new Error('Version ou empreinte PostgreSQL incompatible.');
  }
  return rows.length;
}

function checksum(sql) { return createHash('sha256').update(sql).digest('hex'); }

async function permissions(client, applicationRole, {connect=true}={}) {
  const role = `"${applicationRole}"`;
  // DDL identifiers cannot be parameters; the role is allowlisted and the database is quoted by PostgreSQL.
  const { rows: [{ database }] } = await client.query('SELECT quote_ident(current_database()) AS database');
  await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC, ${role};
    ${connect?`GRANT CONNECT ON DATABASE ${database} TO ${role};`:''}
    REVOKE ALL ON SCHEMA public, household, auth, manger_meta FROM PUBLIC, ${role};
    GRANT USAGE ON SCHEMA household, auth TO ${role};
    REVOKE ALL ON ALL TABLES IN SCHEMA household, auth, manger_meta FROM PUBLIC, ${role};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA household, auth TO ${role};
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA household, auth, manger_meta FROM PUBLIC, ${role};
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA household, auth TO ${role};
    GRANT EXECUTE ON FUNCTION household.storage_status(), household.restart_sequences() TO ${role}`);
}

// Explicit administrative operation only; importing this module opens no connection.
// One reserved client: https://node-postgres.com/features/transactions
async function migrateSchema(pool, applicationRole) {
  if (typeof applicationRole !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(applicationRole) ||
      applicationRole === 'public' || applicationRole.startsWith('pg_')) throw new Error('Rôle applicatif invalide.');
  const client = await reservePostgresClient(pool);
  let failure;
  try {
    // A waiting migrator must read the history AFTER acquiring the transaction lock.
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'");
    await client.query('SELECT pg_advisory_xact_lock(1296125511, 1)');
    await checkRoles(client, applicationRole);
    const count = await history(client), applied = [];
    if(count>0){
      if(count<2)throw new Error('Ancien socle PostgreSQL sans empreinte de structure : crée une cible neuve. Aucune donnée modifiée.');
      await verifyStructure(client);
    }
    for (const migration of migrations.slice(count)) {
      await client.query(migration.sql);
      await client.query('INSERT INTO manger_meta.schema_migrations(version,name,checksum) VALUES($1,$2,$3)',
        [migration.version, migration.name, checksum(migration.sql)]);
      applied.push(migration.version);
    }
    await permissions(client, applicationRole);
    await client.query('UPDATE manger_meta.schema_migrations SET structure_checksum=$1 WHERE version=$2',[await structureFingerprint(client),migrations.at(-1).version]);
    await client.query('COMMIT');
    return { version: migrations.at(-1).version, applied };
  } catch (error) {
    failure = error;
    try { await client.query('ROLLBACK'); }
    catch (rollback) { throw new AggregateError([error, rollback], 'Échec de migration et de rollback PostgreSQL.'); }
    throw error;
  } finally { client.release(failure); }
}

module.exports = { migrateSchema, checkRoles, permissions, history, schemaVersion:migrations.at(-1).version };
