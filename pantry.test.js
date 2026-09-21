const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase, addDays, dateKey, suggestions } = require('./server');
const { groupIngredients } = require('./ingredients');

test('regroupement explicite : unités compatibles, pluriels connus, aucune conversion masse/volume', () => {
  assert.deepEqual(groupIngredients([{ name: 'riz', amount: 500, unit: 'g' }, { name: 'riz', amount: 1, unit: 'kg' }]), [{ name: 'riz', amount: 1500, unit: 'g' }]);
  assert.equal(groupIngredients([{ name: 'œuf', amount: 2, unit: 'pièce' }, { name: 'oeufs', amount: 3, unit: 'pièces' }])[0].amount, 5);
  assert.equal(groupIngredients([{ name: 'farine', amount: 100, unit: 'g' }, { name: 'farine', amount: 10, unit: 'ml' }]).length, 2);
  assert.equal(groupIngredients([{ name: 'tomate', amount: 1, unit: 'g' }, { name: 'tomate concassée', amount: 1, unit: 'g' }]).length, 2);
});

test('suggestions : stock suffisant par participant, unités compatibles et réservations du planning', async t => {
  const db = createDatabase(':memory:'); db.exec('DELETE FROM recipes; DELETE FROM members');
  const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, data) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    assert.ok(response.ok); return response.json();
  };
  const start = dateKey(new Date());
  const member = await post('/api/members', { name: 'Test', diet: 'vegan' });
  const recipe = async (title, name, unit = 'g', diet = 'vegan') => post('/api/recipes', { title, diet, servings: 2, minutes: 20, tags: [], ingredients: [{ name, amount: 200, unit }], steps: [{ kind: 'cook', instruction: 'Cuire.' }] });
  await recipe('A pâtes', 'pâtes');
  const rice = await recipe('Z riz', 'riz');
  await recipe('B riz liquide', 'riz', 'ml');
  await recipe('ZZ viande', 'riz', 'g', 'omnivore');
  await post('/api/pantry', { name: 'riz', unit: 'kg', amount: 0.1 });
  let result = suggestions(db, start, null, [member.id]);
  assert.equal(result[0].id, rice.id);
  assert.deepEqual(result[0].pantryIngredients, ['riz']);
  assert.deepEqual(result.find(row => row.title === 'B riz liquide').pantryIngredients, []);
  assert.equal(result.some(row => row.title === 'ZZ viande'), false);
  // Without participants, use the recipe's original servings, not one implicit person.
  assert.deepEqual(suggestions(db, start, null, []).find(row => row.id === rice.id)?.pantryIngredients, []);
  await post('/api/meals', { date: start, slot: 'midi', location: 'home', occasion: 'regular', recipeId: rice.id, people: 1, title: rice.title });
  assert.deepEqual(suggestions(db, start, null, [member.id]).find(row => row.id === rice.id).pantryIngredients, []);
  await post('/api/pantry', { name: 'riz', unit: 'g', amount: 200 });
  assert.deepEqual(suggestions(db, start, null, [member.id]).find(row => row.id === rice.id).pantryIngredients, ['riz']);
  assert.deepEqual(suggestions(db, addDays(start, 7), null, [member.id]).find(row => row.id === rice.id).pantryIngredients, ['riz']);
  await post('/api/meals', { date: addDays(start, 7), slot: 'soir', location: 'home', occasion: 'regular', recipeId: rice.id, people: 1, title: rice.title });
  assert.deepEqual(suggestions(db, addDays(start, 7), null, [member.id]).find(row => row.id === rice.id).pantryIngredients, []);
  assert.deepEqual(suggestions(db, start, null, [member.id]).find(row => row.id === rice.id).pantryIngredients, ['riz']);
  db.prepare('UPDATE pantry SET recorded_on = ?').run(addDays(start, 10));
  assert.deepEqual(suggestions(db, start, null, [member.id]).find(row => row.id === rice.id).pantryIngredients, []);
  assert.equal(suggestions(db, start, 10, [member.id]).length, 0);
  const response = await fetch(`${base}/api/suggestions?start=${start}&members=${member.id}`);
  assert.equal(response.status, 200);
  assert.ok((await response.json()).every(row => Array.isArray(row.pantryIngredients)));
});

test('placard : déduction, réservation entre semaines, stock daté, mise à jour et suppression', async t => {
  const db = createDatabase(':memory:'); const server = createApp(db);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const start = dateKey(new Date());
  const recipe = await (await post('/api/recipes', { title: 'Riz', servings: 2, minutes: 20, diet: 'vegan', tags: [], ingredients: [{ name: 'riz', amount: 160, unit: 'g' }], steps: [{ kind: 'cook', instruction: 'Cuire.' }] })).json();
  const meal = date => post('/api/meals', { date, slot: 'soir', location: 'home', occasion: 'regular', recipeId: recipe.id, people: 2, title: recipe.title });
  assert.equal((await meal(start)).status, 200); assert.equal((await meal(addDays(start, 7))).status, 200);
  assert.equal((await post('/api/pantry', { name: 'riz', unit: 'kg', amount: .2 })).status, 200);
  const week = async date => (await (await fetch(`${base}/api/week?start=${date}`)).json()).shopping;
  assert.equal((await week(start)).length, 0);
  const next = await week(addDays(start, 7));
  assert.equal(next[0].amount, 120); assert.equal(next[0].fromPantry, 40);
  assert.equal((await week(addDays(start, -6)))[0]?.amount, undefined);
  // A stock recorded after a meal must not erase that meal's past shopping.
  db.prepare('UPDATE pantry SET recorded_on = ?').run(addDays(start, 1));
  assert.equal((await week(start))[0].amount, 160);
  assert.equal((await post('/api/pantry', { name: 'riz', unit: 'g', amount: 100 })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pantry').get().n, 1);
  assert.equal((await week(start))[0].amount, 60);
  assert.equal((await post('/api/pantry', { name: 'riz', unit: 'g', amount: -1 })).status, 400);
  const id = db.prepare('SELECT id FROM pantry').get().id;
  assert.equal((await fetch(`${base}/api/pantry/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await week(start))[0].amount, 160);
});

test('anciens pluriels du placard : mise à jour sans doublon, ambiguïtés conservées et signalées', async t => {
  const db = createDatabase(':memory:'); const server = createApp(db);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const insert = db.prepare('INSERT INTO pantry (food_key, name, unit, amount, recorded_on) VALUES (?, ?, ?, ?, ?)');
  insert.run('concombres\0g', 'concombres', 'g', 500, dateKey(new Date()));
  const save = () => fetch(base + '/api/pantry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'concombre', unit: 'g', amount: 200 }) });
  assert.equal((await save()).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pantry').get().n, 1);
  assert.equal(db.prepare('SELECT amount FROM pantry').get().amount, 200);
  insert.run('concombres\0g', 'concombres', 'g', 500, dateKey(new Date()));
  assert.equal((await save()).status, 400);
  const rows = await (await fetch(base + '/api/pantry')).json();
  assert.ok(rows.every(row => row.ambiguous && row.remaining === 0));
  assert.equal(rows.length, 2);
});
