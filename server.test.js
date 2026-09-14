const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase, shoppingList, suggestions } = require('./server');

test('un repas cuisiné alimente la liste de courses et la recommandation évite le dernier plat', async t => {
  const db = createDatabase(':memory:');
  const server = createApp(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/meals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      date: '2026-09-14',
      slot: 'soir',
      location: 'home',
      occasion: 'regular',
      people: 2,
      recipeId: 1,
      title: 'Bowl pois chiches'
    })
  });
  assert.equal(response.status, 200);

  assert.deepEqual(shoppingList(db, '2026-09-14'), [
    { name: 'citron', unit: 'pièce', amount: 1 },
    { name: 'pois chiches', unit: 'g', amount: 400 },
    { name: 'tomate', unit: 'pièce', amount: 2 }
  ]);
  assert.notEqual(suggestions(db)[0].id, 1);
});

test('les données non fiables sont refusées', async t => {
  const server = createApp(createDatabase(':memory:'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/meals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date: 'demain', slot: 'brunch' })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /invalide/i);
});

test('une recette peut être créée puis modifiée avec ses ingrédients', async t => {
  const server = createApp(createDatabase(':memory:'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const recipe = {
    title: 'Tartines tomates',
    minutes: 15,
    servings: 2,
    tags: ['rapide'],
    instructions: 'Griller le pain puis ajouter les tomates.',
    ingredients: [
      { name: 'pain', amount: 4, unit: 'tranche' },
      { name: 'tomate', amount: 2, unit: 'pièce' }
    ]
  };

  const createdResponse = await fetch(`${baseUrl}/api/recipes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(recipe)
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.ingredients.length, 2);

  const updatedResponse = await fetch(`${baseUrl}/api/recipes/${created.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...recipe, title: 'Bruschettas', ingredients: [recipe.ingredients[1]] })
  });
  assert.equal(updatedResponse.status, 200);
  const updated = await updatedResponse.json();
  assert.equal(updated.title, 'Bruschettas');
  assert.deepEqual(updated.ingredients, [{ name: 'tomate', unit: 'pièce', amount: 2 }]);
});
