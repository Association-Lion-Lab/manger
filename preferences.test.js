const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase, suggestions } = require('./server');

test('les goûts filtrent les propositions sans retirer les recettes et peuvent être effacés', async t => {
  const db = createDatabase(':memory:'); db.exec('DELETE FROM recipes');
  const server = createApp(db); server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (path, method, data) => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  for (const [title, name] of [['À éviter', 'épinards frais'], ['À garder', 'riz']]) {
    await send('/api/recipes', 'POST', { title, minutes: 20, servings: 2, diet: 'vegan', tags: [], ingredients: [{ name, amount: 100, unit: 'g' }], steps: [{ kind: 'cook', instruction: 'Préparer le repas.', minutes: 20 }] });
  }
  const pref = names => send('/api/household/preferences', 'PUT', { avoidedIngredients: names });
  assert.equal(suggestions(db).length, 2);
  assert.equal((await pref(['EPINARD', 'epinard'])).status, 200);
  assert.deepEqual(suggestions(db).map(recipe => recipe.title), ['À garder']);
  assert.equal((await (await fetch(base + '/api/household')).json()).avoidedIngredients.length, 1);
  for (const names of [null, [''], [22], Array(51).fill('riz')]) assert.equal((await pref(names)).status, 400);
  assert.deepEqual(suggestions(db).map(recipe => recipe.title), ['À garder']);
  const week = await (await fetch(base + '/api/week?start=2026-09-14')).json();
  assert.equal(week.recipes.length, 2);
  assert.equal((await pref([])).status, 200);
  assert.equal(suggestions(db).length, 2);
});
