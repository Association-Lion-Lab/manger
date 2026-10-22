const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseFixture } = require('./database');
const { openPostgres } = require('../db/postgres');

test('frontière asynchrone PostgreSQL réelle', { timeout: 90000 }, async t => {
  const fixture = await databaseFixture(t), db = fixture.database;
  const insert = 'INSERT INTO household.ingredients(name,unit) VALUES($1,$2)';

  await t.test('paramètres, Unicode et transaction conservent le même client réservé', async () => {
    const ids = await db.transaction(async tx => {
      const first = (await tx.query('SELECT pg_backend_pid() AS id')).rows[0].id;
      const other = (await db.query('SELECT pg_backend_pid() AS id')).rows[0].id;
      await tx.query(insert, ["Chou d’automne 🥬", 'g']);
      const last = (await tx.query('SELECT pg_backend_pid() AS id')).rows[0].id;
      return { first, other, last };
    });
    assert.equal(ids.first, ids.last); assert.notEqual(ids.first, ids.other);
    assert.equal((await db.query('SELECT name FROM household.ingredients')).rows[0].name, "Chou d’automne 🥬");
  });
  await t.test('rollback intégral pour exception métier ou erreur SQL interceptée', async () => {
    const error = new Error('exception synthétique');
    await assert.rejects(db.transaction(async tx => { await tx.query(insert, ['Annulé', 'g']); throw error; }), candidate => candidate === error);
    await assert.rejects(db.transaction(async tx => {
      await tx.query(insert, ['Aussi annulé', 'g']);
      try { await tx.query('SELECT 1/0'); } catch {}
      return 'ne doit pas être validé';
    }), { code: '22012' });
    assert.equal((await db.query('SELECT count(*) AS n FROM household.ingredients')).rows[0].n, '1');
  });
  await t.test('requête déjà lancée drainée et scope inutilisable après retour', async () => {
    let escaped;
    await db.transaction(async tx => { escaped = tx; tx.query(insert, ['Drainé', 'g']); });
    assert.equal((await db.query('SELECT count(*) AS n FROM household.ingredients')).rows[0].n, '2');
    await assert.rejects(escaped.query(insert, ['Tardif', 'g']), { code: 'POSTGRES_SCOPE_CLOSED' });
  });
  await t.test('timeout SQL réel, client remplacé et accès suivant opérationnel', async () => {
    await assert.rejects(db.transaction(tx => tx.query('SELECT pg_sleep(5)')), { code: '57014' });
    await db.check();
    assert.equal((await db.query('SELECT current_user AS name')).rows[0].name, 'manger_test_app');
  });
  await t.test('paramètres explicites malgré des variables PG ambiantes erronées', async () => {
    const overrides = { PGHOST: 'invalid.example', PGPORT: '1', PGUSER: 'invalid', PGPASSWORD: 'invalid', PGDATABASE: 'invalid', PGSSLMODE: 'require', PGOPTIONS: '-c search_path=public' };
    const saved = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
    let other;
    try {
      Object.assign(process.env, overrides); other = await openPostgres(fixture.config);
      assert.equal((await other.query('SHOW search_path')).rows[0].search_path, 'pg_catalog');
      assert.equal((await other.query('SELECT current_user AS name')).rows[0].name, 'manger_test_app');
    } finally {
      for (const key of Object.keys(overrides)) {
        if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
      }
      await other?.close();
    }
  });
  await t.test('authentification refusée sans fuite du mot de passe', async () => {
    const password = 'synthetic-wrong-password';
    await assert.rejects(openPostgres({ ...fixture.config, password }), error => {
      assert.equal(error.code, '28P01'); assert.ok(!error.message.includes(password)); return true;
    });
  });
  await t.test('coupure pendant un callback inactif, erreur traitée, reprise après redémarrage', async () => {
    let resume, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const work = db.transaction(async tx => {
      await tx.query(insert, ['Coupure annulée', 'g']); entered();
      await new Promise(resolve => { resume = resolve; });
    });
    const rejected = assert.rejects(work, error => ['57P01', 'POSTGRES_QUERY_FAILED'].includes(error.code));
    await ready; await fixture.stop(); await rejected;
    await assert.rejects(db.check());
    resume(); await fixture.start(); await db.check();
    assert.equal((await db.query('SELECT count(*) AS n FROM household.ingredients')).rows[0].n, '2');
  });
  await t.test('arrêt gracieux : requête acceptée conservée, nouveaux accès refusés', async () => {
    const other = await openPostgres(fixture.config);
    try {
      const work = other.transaction(async tx => { await tx.query('SELECT pg_sleep(0.1)'); return 9; });
      const closing = other.close();
      await assert.rejects(other.query('SELECT 1'), { code: 'POSTGRES_CLOSED' });
      assert.equal(await work, 9); await closing; assert.equal(other.state, 'closed');
    } finally { await other.close(); }
  });
  await t.test('arrêt forcé : transaction abandonnée, aucun commit après reprise du callback', async () => {
    const other = await openPostgres(fixture.config); let resume, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const work = other.transaction(async tx => {
      await tx.query(insert, ['Arrêt annulé', 'g']); entered();
      await new Promise(resolve => { resume = resolve; });
    });
    const rejected = assert.rejects(work, { code: 'POSTGRES_CLOSE_TIMEOUT' });
    await ready;
    try { await assert.rejects(other.close(), { code: 'POSTGRES_CLOSE_TIMEOUT' }); await rejected; }
    finally { resume(); }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(other.state, 'closed');
    assert.equal((await db.query('SELECT count(*) AS n FROM household.ingredients')).rows[0].n, '2');
  });
});
