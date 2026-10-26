const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateSchema } = require('./db/postgres-schema');

test('le rôle de migration est explicite et les identifiants dangereux sont refusés sans connexion', async () => {
  const pool = { connect() { assert.fail('Aucune connexion attendue'); } };
  for (const role of [undefined, null, '', 'public', 'pg_read_all_data', 'Admin', 'x'.repeat(64), 'app;DROP ROLE admin']) {
    await assert.rejects(migrateSchema(pool, role), /Rôle applicatif invalide/);
  }
});

test('un rôle valide ne masque pas une connexion indisponible et ne crée aucun stockage de repli', async () => {
  const error = new Error('Synthetic connection failure');
  await assert.rejects(migrateSchema({ connect(callback) { callback(error); } }, 'manger_test_app'), candidate => candidate.cause === error);
});
