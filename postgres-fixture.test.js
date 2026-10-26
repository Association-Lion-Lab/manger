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
  assert.equal(config.scripts.test, 'node --test --test-concurrency=2');
  assert.equal(config.scripts['test:postgres'], 'node --test --test-concurrency=1 test-support/postgres.integration.cjs test-support/postgres-schema.integration.cjs test-support/postgres-connection.integration.cjs test-support/postgres-auth.integration.cjs test-support/postgres-access.integration.cjs test-support/postgres-access-http.integration.cjs test-support/postgres-account-command.integration.cjs test-support/postgres-household.integration.cjs test-support/postgres-household-http.integration.cjs test-support/postgres-recipes.integration.cjs test-support/postgres-recipes-http.integration.cjs test-support/postgres-recipe-extras.integration.cjs test-support/postgres-recipe-extras-http.integration.cjs test-support/postgres-meals.integration.cjs test-support/postgres-meals-http.integration.cjs test-support/postgres-planning.integration.cjs test-support/postgres-planning-http.integration.cjs test-support/postgres-calculations.integration.cjs test-support/postgres-calculations-http.integration.cjs test-support/postgres-shopping.integration.cjs test-support/postgres-shopping-http.integration.cjs');
  assert.equal(config.dependencies.pg, '8.23.1');
  assert.equal(config.devDependencies?.pg, undefined);
  const patterns = readFileSync(join(__dirname, '.dockerignore'), 'utf8').split(/\r?\n/);
  for (const excluded of ['**/test-support', '**/test-support/**']) {
    assert.ok(patterns.indexOf(excluded) > patterns.indexOf('!**/*.js'), excluded);
  }
  assert.match(readFileSync(join(__dirname, '.gitignore'), 'utf8'), /^\/\.test-tools\/$/m);
});
