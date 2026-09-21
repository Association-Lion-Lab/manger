const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { createApp, createDatabase } = require('./server');
const { checkBackup, restoreBackup } = require('./backup-tools');

test('sauvegarde complète : téléchargement explicite, fichier intègre et données restaurables', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'manger-backup-test-'));
  const db = createDatabase(':memory:'); const server = createApp(db);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); rmSync(folder, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  db.prepare('INSERT INTO members(name,diet,avoided_ingredients) VALUES (?,?,?)').run('Test', 'vegetarian', '["tomate crue"]');
  const recipe = db.prepare('SELECT id FROM recipes LIMIT 1').get().id;
  db.prepare('INSERT INTO recipe_photos(recipe_id,data) VALUES (?,?)').run(recipe, Buffer.from('photo-test'));
  db.prepare('INSERT INTO recipe_notes(recipe_id,rating,note) VALUES (?,?,?)').run(recipe, 4, 'Note privée');
  db.prepare('INSERT INTO recipe_favorites(recipe_id) VALUES (?)').run(recipe);
  db.prepare('INSERT INTO pantry(food_key,name,unit,amount,recorded_on,use_by) VALUES (?,?,?,?,?,?)').run('riz\0g','riz','g',300,'2026-09-20','2026-10-01');
  db.prepare('INSERT INTO shopping_manual(week_start,name,amount,unit,aisle,checked) VALUES (?,?,?,?,?,?)').run('2026-09-21','Café',1,'paquet','Épicerie',1);
  assert.equal((await fetch(base + '/api/backup')).status, 403);
  const response = await fetch(base + '/api/backup', { headers: { 'X-Manger-Backup': '1' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-disposition'), /attachment; filename="manger-\d{4}-\d{2}-\d{2}\.db"/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\0');
  const filename = join(folder, 'download.db'); writeFileSync(filename, bytes);
  const restored = new DatabaseSync(filename, { readOnly: true });
  try {
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), []);
    assert.deepEqual(restored.prepare('PRAGMA user_version').get(), db.prepare('PRAGMA user_version').get());
    for (const { name } of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
      const table = '"' + name.replaceAll('"', '""') + '"';
      assert.deepEqual(restored.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), name);
    }
  } finally { restored.close(); }
  // Reopening with the application exercises its normal migrations on the copy only.
  const reopened = createDatabase(filename); assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM members').get().n, 1); reopened.close();
  assert.equal(checkBackup(filename).members, 1);
  const restoredPath = join(folder, 'restored.db');
  await restoreBackup(filename, restoredPath);
  assert.deepEqual(checkBackup(restoredPath), checkBackup(filename));
  await assert.rejects(restoreBackup(filename, restoredPath), { code: 'EEXIST' });
  await assert.rejects(restoreBackup(filename, filename), { code: 'EEXIST' });
  assert.equal(checkBackup(filename).members, 1);
  const invalid = join(folder, 'invalid.db'); writeFileSync(invalid, 'pas une base SQLite');
  assert.throws(() => checkBackup(invalid));
  await assert.rejects(restoreBackup(invalid, join(folder, 'must-not-be-created.db')));
  const future = new DatabaseSync(restoredPath); future.exec('PRAGMA user_version=999'); future.close();
  assert.throws(() => checkBackup(restoredPath), /plus récente/);
  assert.equal((await fetch(base + '/api/household')).status, 200);
});
