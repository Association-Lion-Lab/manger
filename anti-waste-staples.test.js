const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { isAntiWasteIngredient } = require('./ingredients');
const { createApp, createDatabase, suggestions } = require('./server');

test('anti-gaspi : basiques ignorés sans confondre épices et ingrédients frais', () => {
  for (const name of ['SEL', 'sel fin', 'poivre noir', 'huile d’olive', 'HUILE DE COLZA', 'beurre demi-sel', 'vinaigre balsamique', 'sucre roux', 'farine de blé', 'ÉPICES', 'paprika fumé', 'cumin moulu', 'curry', 'cannelle en poudre', 'ail en poudre', 'persil séché', 'basilic déshydraté', 'piment en flocons', 'sauce soja', 'eau']) assert.equal(isAntiWasteIngredient(name), false, name);
  for (const name of ['carottes', 'bœuf', 'poisson', 'œufs', 'poulet', 'tofu', 'lait', 'crème fraîche', 'poivron', 'ail', 'persil frais', 'gingembre', 'piment frais', 'haricots beurre', 'poisson au beurre', 'curry de légumes', 'riz', 'tomates concassées', 'aliment inconnu']) assert.equal(isAntiWasteIngredient(name), true, name);
});

test('suggestions et menu : les basiques ne gonflent aucun score, mais restent dans les courses', async t => {
  const db = createDatabase(':memory:'); db.exec('DELETE FROM recipes');
  const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`, start = '2026-09-21';
  const post = async (path, body) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
  };
  const create = (title, names) => post('/api/recipes', { title, servings: 1, minutes: 5, diet: 'vegan', tags: [], ingredients: names.map(name => ({ name, unit: 'g', amount: 10 })), steps: [{ kind: 'prep', instruction: 'Préparer.' }] });
  const staples = ['sel', 'poivre', 'huile d’olive', 'beurre', 'cumin'];
  const basic = await create('A basiques', staples), fresh = await create('Z carottes', ['carotte']);
  const insert = db.prepare('INSERT INTO pantry(food_key,name,unit,amount,recorded_on,use_by) VALUES (?,?,?,?,?,?)');
  for (const name of [...staples, 'carotte']) insert.run(name, name, 'g', 100, start, start);
  let ranked = suggestions(db, start, null, [], start);
  assert.equal(ranked[0].id, fresh.id);
  const ignored = ranked.find(item => item.id === basic.id);
  assert.deepEqual(ignored.pantryIngredients, []); assert.deepEqual(ignored.useSoonIngredients, []);
  const previewInput = { start, maxMinutes: 5, memberIds: [], people: 1, slots: [{ day: 0, slot: 'soir' }] };
  assert.equal((await post('/api/week/preview', previewInput))[0].recipeId, fresh.id);
  await post('/api/meals', { date: start, slot: 'midi', recipeId: basic.id, title: 'Base', people: 1, location: 'home', occasion: 'regular' });
  ranked = suggestions(db, start, null, [], start);
  assert.deepEqual(ranked.find(item => item.id === basic.id).reusedIngredients, []);
  // A manual choice is retained even if it contains only staple ingredients.
  const fixed = await post('/api/week/preview', { ...previewInput, slots: [{ day: 0, slot: 'soir', recipeId: basic.id }] });
  assert.equal(fixed[0].recipeId, basic.id); assert.deepEqual(fixed[0].pantryIngredients, []);
  const shopping = async () => (await (await fetch(base + `/api/week?start=${start}`)).json()).shopping;
  assert.equal((await shopping()).length, 0); // Physical stocks are still deducted.
  db.exec('DELETE FROM pantry');
  assert.equal((await shopping()).length, staples.length); // Not assumed to be owned.
});

test('courses : l’eau du robinet n’est pas à acheter, mais reste dans les recettes', () => {
  const { pantryShopping, shoppingList } = require('./calculations');
  const date = '2026-11-16', data = { stocks: [], meals: [{ date }], items: [{ date, name: 'eau', unit: 'ml', amount: 530 }, { date, name: 'Eau', unit: 'c. à soupe', amount: 2 }, { date, name: 'eau de coco', unit: 'ml', amount: 200 }, { date, name: 'riz', unit: 'g', amount: 160 }] };
  assert.deepEqual(pantryShopping(data, date).map(item => item.name), ['eau de coco', 'riz']);
  assert.equal(shoppingList(data, date).length, 4);
  const { isTapWater } = require('./ingredients');
  for (const name of ['eau', 'Eau froide', 'eau chaude', 'eau tiède', 'eau tiede', 'eau bouillante', 'eau du robinet', 'eau du robinet froide']) assert.equal(isTapWater(name), true, name);
  for (const name of ['eau gazeuse', 'eau de coco', 'eau de fleur d’oranger', 'eau-de-vie', 'eau minérale']) assert.equal(isTapWater(name), false, name);
});
