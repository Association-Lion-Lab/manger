const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const catalog = require('./catalog');
const { createApp, createDatabase, recipes, saveRecipe, validateRecipe } = require('./server');

test('catalogue enrichi : 100 recettes distinctes, quatre régimes et tous les univers existants', () => {
  assert.equal(catalog.length, 100);
  const titles = catalog.map(item => item.title.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr'));
  assert.equal(new Set(titles).size, catalog.length);
  for (const diet of ['vegan', 'vegetarian', 'pescetarian', 'omnivore']) assert.ok(catalog.filter(item => item.diet === diet).length >= 8, diet);
  for (const tag of ['rat', 'date', 'mijote', 'japon', 'chine', 'terroir', 'chef', 'express', 'batch', 'emporter', 'comfort', 'mediterranee', 'italie', 'inde', 'mexique']) {
    assert.ok(catalog.filter(item => item.tags.includes(tag)).length >= 5, tag);
  }
});

test('catalogue enrichi : 62 fiches quantifiées, étapes propres au plat et cru/cuit explicites', () => {
  const additions = catalog.slice(38);
  assert.equal(additions.length, 62);
  for (const item of additions) {
    assert.doesNotThrow(() => validateRecipe(item), item.title);
    assert.equal(item.servings, 2, item.title);
    assert.ok(item.ingredients.length >= 4, item.title);
    assert.equal(new Set(item.ingredients.map(({ name, unit }) => `${name}|${unit}`)).size, item.ingredients.length, item.title);
    assert.ok(item.ingredients.every(part => Number.isFinite(part.amount) && part.amount > 0 && part.unit && ['raw', 'cooked'].includes(part.preparation)), item.title);
    assert.ok(item.steps.length >= 3 && item.steps.every(step => step.instruction.length >= 40 && step.minutes > 0), item.title);
    assert.equal(item.minutes, item.steps.reduce((sum, step) => sum + step.minutes, 0), item.title);
    if (item.tags.includes('express')) assert.ok(item.minutes <= 30, item.title);
    assert.equal(Object.hasOwn(item, 'rating'), false);
    if (item.ingredients.some(part => /poulet|bœuf|porc|jambon|saucisse/.test(part.name))) assert.equal(item.diet, 'omnivore', item.title);
    if (item.ingredients.some(part => /saumon|truite|thon|crevette|saint-jacques/.test(part.name))) assert.equal(item.diet, 'pescetarian', item.title);
  }
  const salad = additions.find(item => item.title === 'Salade grecque et haricots blancs');
  assert.equal(salad.ingredients.find(item => item.name === 'tomate').preparation, 'raw');
});

test('catalogue enrichi : import depuis 38 recettes sans doublon ni écrasement des personnalisations', async t => {
  const db = createDatabase(':memory:'), server = createApp(db);
  t.after(() => { server.close(); db.close(); });
  for (const item of catalog.slice(0, 38)) saveRecipe(db, validateRecipe(item));
  db.prepare('UPDATE recipes SET minutes=77, source_url=? WHERE title=?').run('https://example.org/personnalisation', catalog[0].title);
  const before = recipes(db);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/catalog/import`;
  const imported = await fetch(url, { method: 'POST' });
  assert.equal(imported.status, 200); assert.deepEqual(await imported.json(), { added: 62 });
  const after = recipes(db);
  assert.equal(after.length, before.length + 62);
  for (const saved of before) assert.deepEqual(after.find(item => item.id === saved.id), saved);
  for (const item of catalog.slice(38)) {
    const saved = after.find(recipe => recipe.title === item.title);
    assert.ok(saved, item.title); assert.deepEqual(saved.tags, item.tags);
    assert.equal(saved.ingredients.length, item.ingredients.length);
    for (const part of item.ingredients) assert.deepEqual({ ...saved.ingredients.find(ingredient => ingredient.name === part.name) }, part);
    assert.deepEqual(saved.steps.map(({ kind, minutes, instruction }) => ({ kind, minutes, instruction })), item.steps);
  }
  assert.deepEqual(await (await fetch(url, { method: 'POST' })).json(), { added: 0 });
  assert.deepEqual(recipes(db), after);
});
