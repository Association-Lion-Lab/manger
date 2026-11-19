const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase } = require('./server');

test('menu anti-gaspi : quantités, dates, réservations, régimes et aperçu sans écriture', async t => {
  const db = createDatabase(':memory:'), server = createApp(db);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const createRecipe = async (title, name, diet = 'vegan') => {
    const response = await post('/api/recipes', { title, minutes: 5, servings: 2, diet, tags: [], ingredients: [{ name, amount: 400, unit: 'g' }], steps: [{ kind: 'prep', instruction: 'Préparer les ingrédients.', minutes: 5 }] });
    assert.equal(response.status, 201); return (await response.json()).id;
  };
  const carrot = await createRecipe('A carottes', 'carotte');
  const tomato = await createRecipe('Z tomates', 'tomate');
  const tomatoes = [tomato, await createRecipe('ZZ tomates bis', 'tomates')];
  // Tirage au sort depuis le 19 novembre 2026 : on vérifie les règles strictes et ce que le placard couvre, pas un ordre alphabétique.
  const usesTomato = item => item.pantryIngredients.some(name => name.startsWith('tomate'));
  const start = '2026-09-21';
  db.prepare("INSERT INTO pantry (food_key, name, amount, unit, recorded_on, use_by) VALUES ('tomato-test', ?, ?, ?, ?, ?)").run('tomates', 0.4, 'kg', start, start);
  db.prepare("INSERT INTO pantry (food_key, name, amount, unit, recorded_on) VALUES ('carrot-test', ?, ?, ?, ?)").run('carotte', 2000, 'g', start);
  const input = { start, maxMinutes: 5, people: 2, memberIds: [], slots: [{ day: 0, slot: 'soir' }, { day: 0, slot: 'midi' }] };
  const preview = async (change = {}) => { const response = await post('/api/week/preview', { ...input, ...change }); const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data; };
  const stocksBefore = db.prepare('SELECT * FROM pantry').all();
  const choices = await preview();
  assert.deepEqual(choices.map(item => item.slot), ['midi', 'soir']);
  assert.ok(tomatoes.includes(choices[0].recipeId), 'tomates à finir aujourd’hui en premier');
  assert.equal(choices[0].pantryIngredients.length, 1); assert.ok(usesTomato(choices[0]));
  assert.notEqual(choices[1].recipeId, choices[0].recipeId);
  assert.ok(!usesTomato(choices[1]), 'stock déjà réservé par le midi');
  const changed = await preview({ slots: [{ day: 0, slot: 'midi', recipeId: carrot }, { day: 0, slot: 'soir' }] });
  assert.equal(changed[0].recipeId, carrot);
  assert.ok(tomatoes.includes(changed[1].recipeId)); assert.ok(usesTomato(changed[1]));
  const laterFixed = await preview({ slots: [{ day: 0, slot: 'midi' }, { day: 0, slot: 'soir', recipeId: tomato }] });
  assert.equal(laterFixed[1].recipeId, tomato);
  assert.ok(!usesTomato(laterFixed[0]));
  const bothFixed = await preview({ slots: [{ day: 0, slot: 'midi', recipeId: carrot }, { day: 0, slot: 'soir', recipeId: carrot }] });
  assert.ok(bothFixed.every(item => item.recipeId === carrot));
  for (const recipeId of [null, '1', 999999]) assert.equal((await post('/api/week/preview', { ...input, slots: [{ day: 0, slot: 'midi', recipeId }] })).status, 400);
  assert.deepEqual(db.prepare('SELECT * FROM pantry').all(), stocksBefore);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meals').get().n, 0);
  assert.ok((await preview({ people: 3 })).every(item => !usesTomato(item)), 'quantité insuffisante pour trois');
  assert.ok((await preview({ slots: [{ day: 1, slot: 'soir' }] })).every(item => !usesTomato(item)), 'tomates périmées le lendemain');
  db.prepare('UPDATE pantry SET recorded_on=? WHERE name=?').run('2026-09-22', 'tomates');
  assert.ok((await preview()).every(item => !usesTomato(item)), 'stock pas encore acheté');
  db.prepare('UPDATE pantry SET recorded_on=?, use_by=NULL WHERE name=?').run(start, 'tomates');
  const planned = await post('/api/meals', { date: '2026-09-23', slot: 'soir', recipeId: tomato, title: 'Réservé', people: 2, location: 'home', occasion: 'regular' });
  assert.equal(planned.status, 200);
  assert.ok((await preview()).every(item => !item.pantryIngredients.includes('tomate')));
  db.prepare("INSERT INTO pantry (food_key, name, amount, unit, recorded_on) VALUES ('duplicate-test', ?, ?, ?, ?)").run('carottes', 2000, 'g', start);
  assert.ok((await preview()).every(item => !item.pantryIngredients.includes('carotte')));
  db.prepare('DELETE FROM pantry WHERE name=?').run('carottes');
  db.prepare('UPDATE pantry SET unit=? WHERE name=?').run('ml', 'carotte');
  assert.ok((await preview()).every(item => !item.pantryIngredients.includes('carotte')));
  const member = await (await post('/api/members', { name: 'Julie', diet: 'vegan' })).json();
  const meat = await createRecipe('0 poulet', 'poulet', 'omnivore');
  assert.ok((await preview({ memberIds: [member.id] })).every(item => item.recipeId !== meat));
  assert.equal((await post('/api/week/preview', { ...input, memberIds: [member.id], slots: [{ day: 0, slot: 'midi', recipeId: meat }] })).status, 400);
  for (const change of [{ memberIds: [] }, { memberIds: [999] }, { memberIds: [member.id, member.id] }, { start: '2026-09-22' }, { maxMinutes: 0 }, { slots: [] }, { slots: [{ day: 7, slot: 'soir' }] }, { slots: [{ day: 2, slot: 'soir' }] }, { slots: [input.slots[0], input.slots[0]] }]) {
    assert.equal((await post('/api/week/preview', { ...input, memberIds: [member.id], ...change })).status, 400);
  }
});
