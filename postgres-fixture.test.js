const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { tmpdir } = require('node:os');
const { postgresFixture } = require('./test-support/postgres');

test('PostgreSQL manquant provoque un échec explicite avant de créer une fixture, sans test ignoré', async () => {
  const previous = process.env.MANGER_TEST_PG_BIN;
  process.env.MANGER_TEST_PG_BIN = join(tmpdir(), 'manger-pg-missing-' + randomUUID());
  try {
    await assert.rejects(postgresFixture({ after() { assert.fail('Aucune fixture ne doit encore être créée'); } }), /PostgreSQL de test absent.*Aucun test ignoré/);
  } finally {
    if (previous === undefined) delete process.env.MANGER_TEST_PG_BIN;
    else process.env.MANGER_TEST_PG_BIN = previous;
  }
});

test('les vrais tests PostgreSQL ont une commande dédiée et leurs outils restent hors image', () => {
  const config = require('./package.json');
  assert.equal(config.scripts.test, 'node --test');
  assert.equal(config.scripts['test:postgres'], 'node --test test-support/postgres.integration.cjs test-support/postgres-schema.integration.cjs');
  assert.equal(config.devDependencies.pg, '8.23.1');
  const patterns = readFileSync(join(__dirname, '.dockerignore'), 'utf8').split(/\r?\n/);
  for (const excluded of ['**/test-support', '**/test-support/**']) {
    assert.ok(patterns.indexOf(excluded) > patterns.indexOf('!**/*.js'), excluded);
  }
  assert.match(readFileSync(join(__dirname, '.gitignore'), 'utf8'), /^\/\.test-tools\/$/m);
});
