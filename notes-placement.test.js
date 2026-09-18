const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase, recipes } = require('./server');

test('notes du foyer conservées à la modification, privées à l’export et validées', async t => {
  const db = createDatabase(':memory:'); const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const put = (path, data) => fetch(base + path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await put('/api/recipes/1/notes', { rating: 4, note: ' Ajouter du citron. ' })).status, 200);
  assert.equal((await put('/api/recipes/1/notes', { rating: 6, note: '' })).status, 400);
  assert.equal((await put('/api/recipes/1/notes', { rating: 4, note: 'x'.repeat(2001) })).status, 400);
  assert.equal((await put('/api/recipes/999/notes', { rating: 4, note: '' })).status, 400);
  const recipe = recipes(db).find(r => r.id === 1);
  assert.equal(recipe.note, 'Ajouter du citron.');
  assert.equal((await put('/api/recipes/1', { ...recipe, title: 'Mon bowl' })).status, 200);
  assert.equal(recipes(db).find(r => r.id === 1).rating, 4);
  const exported = await (await fetch(base + '/api/recipes/export')).json();
  assert.equal(exported.recipes.some(r => 'note' in r || 'rating' in r), false);
});

test('déplacer et copier : conserve les variantes, protège les créneaux et la chronologie des restes', async t => {
  const db = createDatabase(':memory:'); const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const meal = { date: '2026-09-20', slot: 'soir', location: 'home', occasion: 'regular', recipeId: 1, people: 2, title: 'Bowl' };
  assert.equal((await post('/api/meals', meal)).status, 200);
  const id = db.prepare('SELECT id FROM meals').get().id;
  const placement = { action: 'copy', sourceDate: meal.date, sourceSlot: meal.slot, date: '2026-09-21', slot: 'midi' };
  assert.equal((await post(`/api/meals/${id}/placement`, placement)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meals').get().n, 2);
  assert.equal((await post(`/api/meals/${id}/placement`, { ...placement, action: 'move' })).status, 400);
  assert.equal((await post(`/api/meals/${id}/placement`, { ...placement, action: 'move', date: '2026-09-22' })).status, 200);
  assert.equal((await post(`/api/meals/${id}/placement`, { ...placement, date: '2026-09-23' })).status, 400);
  assert.equal((await post('/api/meals/leftovers', { sourceId: id, date: '2026-09-23', slot: 'midi', people: 2 })).status, 201);
  assert.equal((await post(`/api/meals/${id}/placement`, { ...placement, action: 'move', sourceDate: '2026-09-22', sourceSlot: 'midi', date: '2026-09-24' })).status, 400);
  const member = await (await post('/api/members', { name: 'Julie', diet: 'vegetarian' })).json();
  assert.equal((await post('/api/meals', { ...meal, date: '2026-09-25', assignments: [{ memberId: member.id, proteinId: 1, portions: 1 }] })).status, 200);
  const mixed = db.prepare('SELECT id FROM meals WHERE date = ?').get('2026-09-25').id;
  assert.equal((await post(`/api/meals/${mixed}/placement`, { ...placement, sourceDate: '2026-09-25', date: '2026-09-26' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meal_assignments').get().n, 2);
});
