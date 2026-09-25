const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase, suggestions } = require('./server');
const { avoidsIngredient } = require('./public/tastes');

test('goûts personnels, cru/cuit explicite, participants et conservation des profils', async t => {
  const db = createDatabase(':memory:'); db.exec('DELETE FROM recipes');
  const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (path, method, data) => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const admin = await (await send('/api/members', 'POST', { name: 'Admin', diet: 'omnivore', avoidedIngredients: ['tomate crue'] })).json();
  const julie = await (await send('/api/members', 'POST', { name: 'Julie', diet: 'pescetarian', avoidedIngredients: [] })).json();
  for (const name of ['tomates crues', 'tomate cuite', 'tomate', 'riz']) {
    assert.equal((await send('/api/recipes', 'POST', { title: name, minutes: 20, servings: 2, diet: 'vegan', tags: [], ingredients: [{ name: name === 'riz' ? name : 'tomate', preparation: name === 'tomates crues' ? 'raw' : name === 'tomate cuite' ? 'cooked' : 'unknown', amount: 100, unit: 'g' }], steps: [{ kind: 'cook', instruction: 'Cuire le riz et servir les autres ingrédients.', minutes: 20 }] })).status, 201);
  }
  assert.deepEqual(suggestions(db, null, null, [admin.id]).map(r => r.title), ['riz', 'tomate cuite', 'tomate']);
  assert.deepEqual(suggestions(db, null, null, [admin.id]).find(r => r.title === 'tomate').reviewFor, ['Admin']);
  assert.equal(suggestions(db, null, null, [julie.id]).length, 3); // Suggestions are capped at three.
  assert.ok(suggestions(db, null, null, [julie.id]).some(recipe => recipe.title === 'tomate'));
  assert.equal(suggestions(db).length, 3);
  assert.equal((await fetch(base + '/api/suggestions?members=999999')).status, 400);
  assert.equal((await (await fetch(base + `/api/suggestions?members=${julie.id}`)).json()).length, 3);
  assert.equal((await send(`/api/members/${admin.id}`, 'PUT', { name: 'Admin', diet: 'omnivore' })).status, 200);
  let home = await (await fetch(base + '/api/household')).json();
  assert.deepEqual(home.members.find(m => m.id === admin.id).avoidedIngredients, ['tomate crue']);
  for (const avoidedIngredients of [null, [''], [12], Array(51).fill('riz')]) assert.equal((await send(`/api/members/${admin.id}`, 'PUT', { name: 'Admin', diet: 'omnivore', avoidedIngredients })).status, 400);
  assert.equal((await send(`/api/members/${admin.id}`, 'PUT', { name: 'Admin', diet: 'omnivore', avoidedIngredients: [] })).status, 200);
  assert.equal(suggestions(db).length, 3);
  assert.equal(avoidsIngredient({ name: 'tomate', preparation: 'cooked' }, 'tomate cru'), false);
  assert.equal(avoidsIngredient({ name: 'tomate', preparation: 'raw' }, 'tomates cuites'), false);
  assert.equal(avoidsIngredient({ name: 'tomate', preparation: 'cooked' }, 'tomate'), true);
  assert.equal(avoidsIngredient({ name: 'œufs' }, 'oeuf'), true);
  assert.equal(avoidsIngredient({ name: 'laitue' }, 'lait'), false);
  assert.equal((await fetch(base + '/tastes.js')).status, 200);
});

test('les goûts classent les propositions sans exclure les recettes et peuvent être effacés', async t => {
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
  assert.deepEqual(suggestions(db).map(recipe => recipe.title), ['À garder', 'À éviter']);
  assert.deepEqual(suggestions(db)[1].avoidedFor, ['le foyer']);
  assert.equal((await (await fetch(base + '/api/household')).json()).avoidedIngredients.length, 1);
  for (const names of [null, [''], [22], Array(51).fill('riz')]) assert.equal((await pref(names)).status, 400);
  assert.deepEqual(suggestions(db).map(recipe => recipe.title), ['À garder', 'À éviter']);
  const week = await (await fetch(base + '/api/week?start=2026-09-14')).json();
  assert.equal(week.recipes.length, 2);
  assert.equal((await pref([])).status, 200);
  assert.equal(suggestions(db).length, 2);
});
