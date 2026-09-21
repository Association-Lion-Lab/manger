const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { DatabaseSync, backup } = require('node:sqlite');
const { createDatabase, createApp } = require('./server');
const { createRestore } = require('./restore');

async function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'manger-restore-test-'));
  const db = createDatabase(join(folder, 'active.db'));
  const restore = createRestore(db);
  t.after(async () => { await restore.clear(); db.close(); rmSync(folder, { recursive: true, force: true }); });
  db.prepare('INSERT INTO members(name,diet) VALUES (?,?)').run('Avant', 'omnivore');
  const file = join(folder, 'snapshot.db'); await backup(db, file);
  const candidate = new DatabaseSync(file);
  candidate.prepare('UPDATE members SET name=?').run('Après'); candidate.close();
  return { folder, db, restore, file };
}

test('restauration guidée : aperçu sans mutation, jeton, restauration et copie de récupération', async t => {
  const { folder, db, restore, file } = await fixture(t);
  const preview = await restore.preview([readFileSync(file)]);
  assert.equal(preview.members, 1);
  assert.equal(db.prepare('SELECT name FROM members').get().name, 'Avant');
  await assert.rejects(restore.apply('incorrect'), /expiré/);
  const result = await restore.apply(preview.token);
  assert.equal(result.restored, true);
  assert.equal(db.prepare('SELECT name FROM members').get().name, 'Après');
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  const recovery = new DatabaseSync(join(folder, result.recovery), { readOnly: true });
  try { assert.equal(recovery.prepare('SELECT name FROM members').get().name, 'Avant'); }
  finally { recovery.close(); }
  await assert.rejects(restore.apply(preview.token), /expiré/);
});

test('restauration : fichiers invalides et structures actives refusés sans mutation', async t => {
  const { db, restore, file } = await fixture(t);
  await assert.rejects(restore.preview([Buffer.from('invalide')]));
  await assert.rejects(restore.preview([]), /Choisis/);
  const candidate = new DatabaseSync(file);
  candidate.exec('CREATE VIEW malicious AS SELECT * FROM members'); candidate.close();
  await assert.rejects(restore.preview([readFileSync(file)]), /structure/);
  assert.equal(db.prepare('SELECT name FROM members').get().name, 'Avant');
});

test('restauration : une contrainte incompatible annule toute la transaction', async t => {
  const { db, restore, file } = await fixture(t);
  const candidate = new DatabaseSync(file);
  candidate.prepare('INSERT INTO members(name,diet) VALUES (?,?)').run('Autre', 'omnivore'); candidate.close();
  const preview = await restore.preview([readFileSync(file)]);
  // Simulate a destination constraint introduced since the preview.
  db.exec('CREATE UNIQUE INDEX unique_member_initial ON members(substr(name,1,1))');
  await assert.rejects(restore.apply(preview.token), /UNIQUE/);
  assert.equal(db.prepare('SELECT name FROM members').get().name, 'Avant');
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  await assert.rejects(restore.apply(preview.token), /expiré/);
});

test('restauration HTTP : action explicite obligatoire et serveur utilisable après remplacement', async t => {
  const { db, file } = await fixture(t);
  const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'x-manger-restore': '1' };
  assert.equal((await fetch(base + '/api/restore/preview', { method: 'POST', body: readFileSync(file) })).status, 403);
  const response = await fetch(base + '/api/restore/preview', { method: 'POST', headers, body: readFileSync(file) });
  assert.equal(response.status, 200);
  const { token } = await response.json();
  const applied = await fetch(base + '/api/restore/apply', { method: 'POST', headers, body: JSON.stringify({ token }) });
  assert.equal(applied.status, 200);
  assert.equal((await fetch(base + '/api/health')).status, 200);
  assert.equal(db.prepare('SELECT name FROM members').get().name, 'Après');
});
