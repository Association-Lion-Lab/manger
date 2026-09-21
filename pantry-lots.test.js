const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase, dateKey, addDays, suggestions } = require('./server');

test('lots : addition, dates prioritaires, réservations partagées, édition ciblée et suppression', async t => {
  const db = createDatabase(':memory:'), server = createApp(db);
  db.exec('DELETE FROM recipes');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
  };
  const get = async path => (await fetch(base + path)).json();
  const today = dateKey(new Date()), yesterday = addDays(today, -1);
  const recipe = await post('/api/recipes', { title: 'Riz test lots', servings: 1, diet: 'vegan', minutes: 5, tags: [], ingredients: [{ name: 'riz', amount: 200, unit: 'g' }], steps: [{ kind: 'cook', instruction: 'Cuire le riz.' }] });
  await post('/api/pantry', { name: 'riz', amount: 150, unit: 'g', useBy: today, newLot: true });
  const rows = await post('/api/pantry', { name: 'riz', amount: .15, unit: 'kg', useBy: addDays(today, 10), newLot: true });
  assert.equal(rows.length, 2); assert.ok(rows.every(row => !row.ambiguous));
  assert.deepEqual(suggestions(db, today, null, [], today).find(row => row.id === recipe.id).pantryIngredients, ['riz']);
  assert.deepEqual(suggestions(db, today, null, [], today).find(row => row.id === recipe.id).useSoonIngredients, ['riz']);
  const day = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const menu = await post('/api/week/preview', { start: addDays(today, -day), maxMinutes: 5, people: 1, memberIds: [], slots: [{ day, slot: 'midi' }, { day, slot: 'soir' }] });
  assert.deepEqual(menu[0].pantryIngredients, ['riz']);
  assert.deepEqual(menu[1].pantryIngredients, []);
  assert.equal(db.prepare('SELECT amount FROM pantry WHERE id=?').get(rows[0].id).amount, 150);
  db.prepare('UPDATE pantry SET recorded_on=?').run(addDays(today, -2));
  const meal = date => post('/api/meals', { date, slot: 'soir', recipeId: recipe.id, title: recipe.title, people: 1, location: 'home', occasion: 'regular' });
  await meal(yesterday);
  const after = await get('/api/pantry');
  assert.equal(after.find(row => row.id === rows[0].id).remaining, 0);
  assert.equal(after.find(row => row.id === rows[1].id).remaining, .1);
  await meal(addDays(today, 1));
  const shopping = (await get(`/api/week?start=${today}`)).shopping.find(row => row.name === 'riz');
  assert.equal(shopping.amount, 100); assert.equal(shopping.fromPantry, 100);
  assert.deepEqual(suggestions(db, today, null, [], today).find(row => row.id === recipe.id).pantryIngredients, []);
  const updated = await post('/api/pantry', { id: rows[1].id, name: 'riz', unit: 'kg', amount: .4 });
  assert.equal(updated.length, 2); assert.equal(updated.find(row => row.id === rows[0].id).amount, 150);
  assert.equal(updated.find(row => row.id === rows[1].id).useBy, addDays(today, 10));
  assert.equal((await get(`/api/week?start=${today}`)).shopping.length, 0);
  for (const change of [{ id: 999 }, { id: rows[1].id, name: 'farine' }, { id: rows[1].id, newLot: true }]) {
    const response = await fetch(base + '/api/pantry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'riz', unit: 'kg', amount: 1, ...change }) });
    assert.equal(response.status, 400);
  }
  assert.equal((await fetch(base + `/api/pantry/${rows[1].id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await get('/api/pantry')).length, 1);
  assert.equal((await get(`/api/week?start=${today}`)).shopping.find(row => row.name === 'riz').amount, 200);
});
