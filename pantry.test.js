const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase, addDays, dateKey } = require('./server');
const { groupIngredients } = require('./ingredients');

test('regroupement explicite : unités compatibles, pluriels connus, aucune conversion masse/volume', () => {
  assert.deepEqual(groupIngredients([{ name: 'riz', amount: 500, unit: 'g' }, { name: 'riz', amount: 1, unit: 'kg' }]), [{ name: 'riz', amount: 1500, unit: 'g' }]);
  assert.equal(groupIngredients([{ name: 'œuf', amount: 2, unit: 'pièce' }, { name: 'oeufs', amount: 3, unit: 'pièces' }])[0].amount, 5);
  assert.equal(groupIngredients([{ name: 'farine', amount: 100, unit: 'g' }, { name: 'farine', amount: 10, unit: 'ml' }]).length, 2);
  assert.equal(groupIngredients([{ name: 'tomate', amount: 1, unit: 'g' }, { name: 'tomate concassée', amount: 1, unit: 'g' }]).length, 2);
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
