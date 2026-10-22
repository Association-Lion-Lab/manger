const { postgresFixture } = require('./postgres');
const { migrateSchema } = require('../db/postgres-schema');
const { openPostgres } = require('../db/postgres');

async function databaseFixture(t) {
  let database;
  const fixture = await postgresFixture({ after(cleanup) {
    t.after(async () => {
      try { await database?.close(); }
      finally { await cleanup(); }
    });
  } });
  await migrateSchema(fixture.migrationPool, 'manger_test_app');
  const { host, port, user, password, database: name } = fixture.pool.options;
  const config = { host, port, user, password, database: name, ssl: false };
  database = await openPostgres(config);
  return { ...fixture, database, config };
}

module.exports = { databaseFixture };
