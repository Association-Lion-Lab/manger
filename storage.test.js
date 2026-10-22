const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { storageEngine } = require('./db/storage');

test('sélection explicite du moteur, valeurs inconnues jamais ramenées à SQLite', () => {
  assert.equal(storageEngine({}), 'sqlite');
  for (const name of ['sqlite', 'postgres']) assert.equal(storageEngine({ MANGER_STORAGE: name }), name);
  for (const name of ['', 'POSTGRES', 'postgresql', 'unknown', ' sqlite ']) {
    assert.throws(() => storageEngine({ MANGER_STORAGE: name }), { code: 'MANGER_STORAGE_INVALID' });
  }
});

test('lancement normal refuse PostgreSQL incomplet ou moteur inconnu avant toute base ou écoute', t => {
  const directory = mkdtempSync(join(tmpdir(), 'manger-storage-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('MANGER_')));
  Object.assign(env, { MANGER_DB: join(directory, 'manger.db') });
  const script = 'require("node:net").Server.prototype.listen = () => { throw new Error("unexpected-listen"); }; require("./server").createApp().listen(0);';
  for (const engine of ['postgres', 'invalid']) {
    const result = spawnSync(process.execPath, ['-e', script], { cwd: __dirname, env: { ...env, MANGER_STORAGE: engine }, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined); assert.notEqual(result.status, 0);
    assert.match(result.stderr, engine === 'postgres' ? /MANGER_POSTGRES_NOT_READY/ : /MANGER_STORAGE_INVALID/);
    assert.doesNotMatch(result.stderr, /unexpected-listen/);
    assert.deepEqual(readdirSync(directory), [], 'aucun fichier créé en cas de refus');
  }
});

test('lancement SQLite par défaut ou explicite : comptes obligatoires et refus HTTP sans session', t => {
  const directory = mkdtempSync(join(tmpdir(), 'manger-storage-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('MANGER_')));
  const script = `
    const assert = require('node:assert/strict');
    const { once } = require('node:events');
    (async () => {
      const server = require('./server').createApp();
      try {
        server.listen(0, '127.0.0.1'); await once(server, 'listening');
        const base = 'http://127.0.0.1:' + server.address().port;
        assert.equal((await fetch(base + '/api/household', { redirect:'manual' })).status, 401);
        assert.equal((await fetch(base + '/login')).status, 200);
      } finally { await new Promise(resolve => server.close(resolve)); }
    })().catch(error => { console.error(error); process.exitCode = 1; });`;
  for (const engine of [undefined, 'sqlite']) {
    const config = { ...env, MANGER_DB: join(directory, engine || 'default', 'manger.db') };
    if (engine !== undefined) config.MANGER_STORAGE = engine;
    const result = spawnSync(process.execPath, ['-e', script], { cwd: __dirname, env: config, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(join(directory, engine || 'default')).sort(), ['accounts.db', 'manger.db']);
  }
});
