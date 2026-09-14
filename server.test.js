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

  const deleted = await fetch(`${baseUrl}/api/meals?date=2026-09-14&slot=soir`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.deepEqual(shoppingList(db, '2026-09-14'), []);
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

test('une recette peut être créée puis modifiée avec ses ingrédients et ses étapes', async t => {
  const server = createApp(createDatabase(':memory:'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const recipe = {
    title: 'Tartines tomates',
    minutes: 15,
    servings: 2,
    diet: 'vegetarian',
    tags: ['rapide'],
    ingredients: [
      { name: 'pain', amount: 4, unit: 'tranche' },
      { name: 'tomate', amount: 2, unit: 'pièce' }
    ],
    steps: [
      { kind: 'prep', instruction: 'Couper les tomates.', minutes: 5 },
      { kind: 'cook', instruction: 'Griller le pain.', minutes: 4 },
      { kind: 'serve', instruction: 'Déposer les tomates sur le pain.', minutes: null }
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
  assert.equal(updated.steps.length, 3);
  assert.deepEqual(updated.steps.map(step => step.kind), ['prep', 'cook', 'serve']);
});

test('un foyer mixte reçoit des protéines compatibles ajoutées aux courses', async t => {
  const db = createDatabase(':memory:');
  const server = createApp(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const add = (path, body) => fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const alice = await (await add('/api/members', { name: 'Alice', diet: 'vegetarian' })).json();
  const bob = await (await add('/api/members', { name: 'Bob', diet: 'omnivore' })).json();
  const household = await (await fetch(`${baseUrl}/api/household`)).json();
  const tofu = household.proteins.find(protein => protein.name === 'tofu');
  const beef = household.proteins.find(protein => protein.name === 'bœuf');

  const incompatible = await add('/api/meals', { date: '2026-09-14', slot: 'midi', location: 'home', occasion: 'regular', people: 1, recipeId: 1, title: 'Bowl', assignments: [{ memberId: alice.id, proteinId: beef.id, portions: 1 }] });
  assert.equal(incompatible.status, 400);

  const meal = await add('/api/meals', { date: '2026-09-14', slot: 'soir', location: 'home', occasion: 'regular', people: 2, recipeId: 1, title: 'Bowl', assignments: [{ memberId: alice.id, proteinId: tofu.id, portions: 1 }, { memberId: bob.id, proteinId: beef.id, portions: 1 }] });
  assert.equal(meal.status, 200);
  assert.deepEqual(shoppingList(db, '2026-09-14').filter(item => ['tofu', 'bœuf'].includes(item.name)), [
    { name: 'bœuf', unit: 'g', amount: 150 },
    { name: 'tofu', unit: 'g', amount: 120 }
  ]);

  const seitan = await add('/api/proteins', { name: 'Seitan grillé', category: 'plant', amount: 130, unit: 'g' });
  assert.equal(seitan.status, 201);
});

test('deux recettes coordonnées respectent les régimes et alimentent les courses', async t => {
  const db = createDatabase(':memory:');
  const server = createApp(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const add = (path, body) => fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const alice = await (await add('/api/members', { name: 'Alice', diet: 'vegetarian' })).json();
  const bob = await (await add('/api/members', { name: 'Bob', diet: 'omnivore' })).json();
  const steak = await (await add('/api/recipes', {
    title: 'Steak minute', minutes: 10, servings: 1, diet: 'omnivore', tags: ['rapide'],
    ingredients: [{ name: 'steak haché', amount: 150, unit: 'g' }],
    steps: [{ kind: 'cook', instruction: 'Cuire le steak.', minutes: 6 }]
  })).json();

  const incompatible = await add('/api/meals', { date: '2026-09-14', slot: 'midi', location: 'home', occasion: 'regular', people: 1, recipeId: null, title: 'Duo', dishes: [{ memberId: alice.id, recipeId: steak.id, portions: 1 }] });
  assert.equal(incompatible.status, 400);

  const duo = await add('/api/meals', { date: '2026-09-14', slot: 'soir', location: 'home', occasion: 'regular', people: 2, recipeId: null, title: 'Bowl + steak', dishes: [{ memberId: alice.id, recipeId: 1, portions: 1 }, { memberId: bob.id, recipeId: steak.id, portions: 1 }] });
  assert.equal(duo.status, 200);
  assert.deepEqual(shoppingList(db, '2026-09-14').filter(item => ['pois chiches', 'steak haché'].includes(item.name)), [
    { name: 'pois chiches', unit: 'g', amount: 200 },
    { name: 'steak haché', unit: 'g', amount: 150 }
  ]);
});
