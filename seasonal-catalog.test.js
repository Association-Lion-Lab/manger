const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase, recipes } = require('./server');
const catalog = require('./catalog');

test('les quatre adaptations saisonnières sont quantifiées, annotées et liées à leurs références', () => {
  const additions = catalog.slice(-4);
  assert.deepEqual(additions.map(item => item.diet), ['vegetarian', 'vegan', 'vegetarian', 'omnivore']);
  assert.equal(new Set(catalog.map(item => item.title)).size, catalog.length);
  for (const item of additions) {
    assert.equal(item.servings, 2);
    assert.equal(item.minutes, item.steps.reduce((total, step) => total + step.minutes, 0));
    assert.ok(item.ingredients.every(ingredient => ingredient.amount > 0 && ingredient.unit));
    assert.ok(item.ingredients.some(ingredient => ingredient.preparation === 'cooked'));
    assert.ok(item.steps.every(step => step.instruction.length > 30));
    assert.equal(new URL(item.sourceUrl).hostname, 'www.marmiton.org');
    assert.equal(new URL(item.sourceUrl).protocol, 'https:');
    assert.equal(Object.hasOwn(item, 'rating'), false);
  }
});

test('mise à jour depuis 34 recettes : quatre ajouts, références enregistrées et personnalisations préservées', async t => {
  const db = createDatabase(':memory:');
  const server = createApp(db);
  t.after(() => { server.close(); db.close(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/catalog/import`;
  assert.deepEqual(await (await fetch(url, { method: 'POST' })).json(), { added: catalog.length });
  for (const item of catalog.slice(-4)) db.prepare('DELETE FROM recipes WHERE title=?').run(item.title);
  db.prepare('UPDATE recipes SET minutes=77, source_url=? WHERE title=?').run('https://example.org/ma-recette', catalog[0].title);
  const before = recipes(db);
  assert.deepEqual(await (await fetch(url, { method: 'POST' })).json(), { added: 4 });
  const after = recipes(db);
  for (const item of before) assert.deepEqual(after.find(saved => saved.id === item.id), item);
  for (const draft of catalog.slice(-4)) {
    const saved = after.find(item => item.title === draft.title);
    assert.equal(saved.sourceUrl, draft.sourceUrl);
    assert.equal(saved.ingredients.length, draft.ingredients.length);
    for (const ingredient of draft.ingredients) {
      assert.deepEqual({ ...saved.ingredients.find(item => item.name === ingredient.name) }, ingredient);
    }
    assert.deepEqual(saved.steps.map(({ kind, minutes, instruction }) => ({ kind, minutes, instruction })), draft.steps);
  }
  assert.deepEqual(await (await fetch(url, { method: 'POST' })).json(), { added: 0 });
  assert.deepEqual(recipes(db), after);
});
