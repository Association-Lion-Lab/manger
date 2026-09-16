const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase, recipes } = require('./server');

test('les favoris sont validés, indépendants des modifications et retirés avec la recette', async t => {
  const db = createDatabase(':memory:');
  const server = createApp(db); server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const put = (id, data) => fetch(`${base}/api/recipes/${id}/favorite`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const recipe = recipes(db)[0];
  assert.equal(recipe.favorite, false);
  assert.equal((await put(recipe.id, { favorite: 'true' })).status, 400);
  assert.equal((await put(99999, { favorite: true })).status, 400);
  assert.equal((await put(recipe.id, { favorite: true })).status, 200);
  assert.equal((await put(recipe.id, { favorite: true })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recipe_favorites').get().n, 1);
  assert.equal(recipes(db).find(item => item.id === recipe.id).favorite, true);
  assert.equal((await fetch(`${base}/api/recipes/${recipe.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...recipe, title: 'Recette modifiée' }) })).status, 200);
  assert.equal(recipes(db).find(item => item.id === recipe.id).favorite, true);
  assert.equal((await put(recipe.id, { favorite: false })).status, 200);
  assert.equal(recipes(db).find(item => item.id === recipe.id).favorite, false);
  await put(recipe.id, { favorite: true });
  assert.equal((await fetch(`${base}/api/recipes/${recipe.id}`, { method: 'DELETE' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recipe_favorites').get().n, 0);
});
