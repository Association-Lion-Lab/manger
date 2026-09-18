const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createApp, createDatabase, recipes, saveRecipe, validateRecipe, shoppingList } = require('./server');
const { ingredientTaste, recipeTaste } = require('./public/tastes');
const catalog = require('./catalog');

test('état par recette : validation, édition, export/import, courses inchangées', async t => {
  const db = createDatabase(':memory:');
  const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (path, method, data) => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const draft = { title: 'Salade', minutes: 15, servings: 2, diet: 'vegan', tags: [], ingredients: [{ name: 'tomate', unit: 'pièce', amount: 2, preparation: 'raw' }], steps: [{ kind: 'prep', instruction: 'Couper et servir.', minutes: 15 }] };
  const raw = await (await send('/api/recipes', 'POST', draft)).json();
  assert.equal(raw.ingredients[0].preparation, 'raw');
  const cooked = await (await send('/api/recipes', 'POST', { ...draft, title: 'Tomates au four', ingredients: [{ ...draft.ingredients[0], preparation: 'cooked' }] })).json();
  assert.equal(cooked.ingredients[0].preparation, 'cooked');
  assert.equal(recipes(db).find(recipe => recipe.id === raw.id).ingredients[0].preparation, 'raw');
  for (const preparation of [null, 'grilled', 1]) assert.equal((await send('/api/recipes', 'POST', { ...draft, ingredients: [{ ...draft.ingredients[0], preparation }] })).status, 400);
  for (const [slot, recipe] of [['midi', raw], ['soir', cooked]]) assert.equal((await send('/api/meals', 'POST', { date: '2026-09-21', slot, recipeId: recipe.id, title: recipe.title, location: 'home', occasion: 'regular', people: 2 })).status, 200);
  const tomatoes = shoppingList(db, '2026-09-21').filter(item => item.name === 'tomate');
  assert.equal(tomatoes.length, 1); assert.equal(tomatoes[0].amount, 4);
  const data = await (await fetch(base + '/api/recipes/export')).json();
  const preview = await (await send('/api/recipes/import-preview', 'POST', { kind: 'file', data })).json();
  assert.equal(preview.recipes.find(recipe => recipe.title === 'Salade').ingredients[0].preparation, 'raw');
  const legacy = structuredClone(data); legacy.recipes.forEach(recipe => recipe.ingredients.forEach(item => delete item.preparation));
  const old = await (await send('/api/recipes/import-preview', 'POST', { kind: 'file', data: legacy })).json();
  assert.equal(old.recipes[0].ingredients[0].preparation, 'unknown'); assert.ok(old.warnings.some(text => text.includes('Cru/cuit')));
  const updated = await (await send(`/api/recipes/${raw.id}`, 'PUT', { ...draft, ingredients: [{ ...draft.ingredients[0], preparation: 'unknown' }] })).json();
  assert.equal(updated.ingredients[0].preparation, 'unknown');
  assert.equal(ingredientTaste({ name: 'tomate crue', preparation: 'unknown' }, 'tomate crue'), 'check');
  assert.equal(ingredientTaste({ name: 'tomate', preparation: 'cooked' }, 'tomate crue'), 'clear');
  assert.equal(ingredientTaste({ name: 'tomate', preparation: 'raw' }, 'tomate crue'), 'avoid');
  assert.deepEqual(recipeTaste(updated.ingredients, [{ name: 'Romain', avoidedIngredients: ['tomate crue'] }]).reviewFor, ['Romain']);
});

test('migration : annote les originaux, jamais une recette modifiée ou un état déjà choisi', () => {
  const folder = mkdtempSync(join(tmpdir(), 'manger-preparation-')); const path = join(folder, 'test.db');
  let db;
  try {
    db = createDatabase(path);
    const ratatouille = catalog.find(recipe => recipe.title === 'Ratatouille à la poêle');
    const original = saveRecipe(db, validateRecipe(ratatouille));
    const custom = saveRecipe(db, validateRecipe({ ...ratatouille, steps: [...ratatouille.steps, { kind: 'serve', instruction: 'Ajouter des tomates crues.', minutes: 1 }] }));
    db.exec("UPDATE recipe_ingredients SET preparation = 'unknown'; PRAGMA user_version = 1");
    db.prepare("UPDATE recipe_ingredients SET preparation = 'raw' WHERE recipe_id = ? AND ingredient_id = (SELECT id FROM ingredients WHERE name = 'ail' AND unit = 'gousse')").run(original.id);
    db.close(); db = createDatabase(path);
    const all = recipes(db);
    assert.equal(all.find(recipe => recipe.id === original.id).ingredients.find(item => item.name === 'tomate').preparation, 'cooked');
    assert.equal(all.find(recipe => recipe.id === original.id).ingredients.find(item => item.name === 'ail').preparation, 'raw');
    assert.equal(all.find(recipe => recipe.id === custom.id).ingredients.find(item => item.name === 'tomate').preparation, 'unknown');
    assert.equal(all.find(recipe => recipe.title === 'Bowl pois chiches').ingredients.find(item => item.name === 'tomate').preparation, 'raw');
    db.exec("UPDATE recipe_ingredients SET preparation = 'unknown'"); db.close(); db = createDatabase(path);
    assert.equal(recipes(db).find(recipe => recipe.id === original.id).ingredients.find(item => item.name === 'tomate').preparation, 'unknown');
  } finally { if (db?.isOpen) db.close(); rmSync(folder, { recursive: true, force: true }); }
});
