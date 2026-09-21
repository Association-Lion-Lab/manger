const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createApp, createDatabase, dateKey, addDays, suggestions } = require('./server');

test('placard daté : migration non destructive et réouverture', t => {
  const dir = mkdtempSync(join(tmpdir(), 'manger-pantry-dates-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filename = join(dir, 'test.db');
  const old = new DatabaseSync(filename);
  old.exec("CREATE TABLE pantry (id INTEGER PRIMARY KEY, food_key TEXT UNIQUE, name TEXT, unit TEXT, amount REAL, recorded_on TEXT); INSERT INTO pantry VALUES (1, 'riz', 'riz', 'g', 250, '2026-01-01');"); old.close();
  let db = createDatabase(filename);
  assert.equal(db.prepare('SELECT use_by FROM pantry').get().use_by, null);
  assert.equal(db.prepare('SELECT explicit_lot FROM pantry').get().explicit_lot, 0);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  db.prepare('UPDATE pantry SET use_by=?').run('2026-12-31'); db.close();
  db = createDatabase(filename);
  assert.equal(db.prepare('SELECT amount, use_by FROM pantry').get().amount, 250);
  assert.equal(db.prepare('SELECT use_by FROM pantry').get().use_by, '2026-12-31'); db.close();
});

test('placard daté : limite inclusive, courses, suggestions ciblées, validation et effacement', async t => {
  const db = createDatabase(':memory:'); db.exec('DELETE FROM recipes; DELETE FROM members');
  const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const get = async path => (await fetch(base + path)).json();
  const start = dateKey(new Date()), limit = addDays(start, 2);
  const recipe = async (title, name) => (await post('/api/recipes', { title, diet: 'vegan', minutes: 20, servings: 2, tags: [], ingredients: [{ name, amount: 200, unit: 'g' }], steps: [{ kind: 'cook', instruction: 'Cuire.' }] })).json();
  await recipe('A pâtes', 'pâtes'); const rice = await recipe('Z riz', 'riz');
  const stock = { name: 'riz', unit: 'g', amount: 1000, useBy: limit };
  assert.equal((await post('/api/pantry', stock)).status, 200);
  assert.equal((await post('/api/pantry', { name: 'pâtes', unit: 'g', amount: 1000 })).status, 200);
  assert.equal((await get('/api/pantry')).find(item => item.name === 'riz').dateStatus, 'soon');
  assert.equal(suggestions(db, start, null, null, start)[0].id, rice.id);
  assert.deepEqual(suggestions(db, start, null, null, limit)[0].useSoonIngredients, ['riz']);
  assert.deepEqual(suggestions(db, start, null, null, addDays(limit, 1)).find(item => item.id === rice.id).pantryIngredients, []);
  for (const date of [limit, addDays(limit, 1)]) assert.equal((await post('/api/meals', { date, slot: 'soir', location: 'home', occasion: 'regular', recipeId: rice.id, people: 2, title: rice.title })).status, 200);
  const shopping = (await get(`/api/week?start=${start}`)).shopping;
  assert.equal(shopping.find(item => item.name === 'riz').amount, 200);
  assert.equal(shopping.find(item => item.name === 'riz').fromPantry, 200);
  // No expiry supplied by an older client must preserve the stored date.
  assert.equal((await post('/api/pantry', { name: 'riz', amount: 1000, unit: 'g' })).status, 200);
  assert.equal((await get('/api/pantry')).find(item => item.name === 'riz').useBy, limit);
  for (const useBy of ['2026-02-30', 'not a date', 123, '', '2026-13-01']) assert.equal((await post('/api/pantry', { ...stock, useBy })).status, 400);
  assert.equal((await post('/api/pantry', { ...stock, useBy: addDays(start, -1) })).status, 200);
  assert.equal((await get('/api/pantry')).find(item => item.name === 'riz').dateStatus, 'past');
  assert.equal((await get(`/api/week?start=${start}`)).shopping.find(item => item.name === 'riz').amount, 400);
  assert.equal((await post('/api/pantry', { ...stock, useBy: null })).status, 200);
  assert.equal((await get('/api/pantry')).find(item => item.name === 'riz').useBy, null);
  assert.equal((await get(`/api/week?start=${start}`)).shopping.length, 0);
  assert.equal((await fetch(`${base}/api/suggestions?start=${start}&date=${addDays(start, 7)}`)).status, 400);
  assert.equal((await fetch(`${base}/api/suggestions?start=${start}&date=2026-02-30`)).status, 400);
});
