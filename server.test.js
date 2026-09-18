const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createApp, createDatabase, restaurantResults, shoppingList, suggestions } = require('./server');

test('les ajouts aux courses sont indépendants, isolés par semaine et validés', async t => {
  const db = createDatabase(':memory:');
  const server = createApp(db); server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const input = { weekStart: '2026-09-14', name: 'Savon', amount: 2, unit: 'pièce', aisle: 'Maison' };
  for (const bad of [{ amount: -1 }, { amount: '2' }, { name: ' ' }, { aisle: 'inconnu' }, { weekStart: '2026-99-99' }]) assert.equal((await post('/api/shopping-manual', { ...input, ...bad })).status, 400);
  const added = await (await post('/api/shopping-manual', input)).json();
  const week = async start => (await (await fetch(`${base}/api/week?start=${start}`)).json()).shopping;
  let items = await week(input.weekStart);
  assert.equal(items.find(item => item.manualId === added.id).amount, 2);
  assert.equal((await week('2026-09-21')).length, 0);
  assert.equal((await post('/api/shopping-checks', { ...input, manualId: added.id, checked: true })).status, 200);
  assert.equal((await post('/api/shopping-checks', { ...input, weekStart: '2026-09-21', manualId: added.id, checked: true })).status, 400);
  assert.equal((await week(input.weekStart)).find(item => item.manualId === added.id).checked, true);
  assert.equal((await post('/api/shopping-aisles', { ...input, manualId: added.id, aisle: 'Épicerie' })).status, 200);
  assert.equal((await week(input.weekStart)).find(item => item.manualId === added.id).aisle, 'Épicerie');
  assert.equal((await post('/api/shopping-aisles', { ...input, aisle: 'incorrect' })).status, 400);
  db.exec('DELETE FROM meals');
  assert.equal((await week(input.weekStart)).length, 1);
  assert.equal((await fetch(`${base}/api/shopping-manual/${added.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await week(input.weekStart)).length, 0);
  await post('/api/meals', { date: input.weekStart, slot: 'soir', location: 'home', occasion: 'regular', people: 2, recipeId: 1, title: 'Repas', assignments: [], dishes: [] });
  const ingredient = (await week(input.weekStart))[0];
  assert.ok(ingredient);
  assert.equal((await post('/api/shopping-aisles', { ...ingredient, aisle: 'Surgelés' })).status, 200);
  assert.equal((await week(input.weekStart))[0].aisle, 'Surgelés');
  db.exec("UPDATE meals SET date = '2026-09-21'");
  assert.equal((await week('2026-09-21'))[0].aisle, 'Surgelés');
  assert.equal((await post('/api/shopping-aisles', { ...ingredient, aisle: '' })).status, 200);
  assert.equal((await week('2026-09-21'))[0].aisle, null);
});

test('la composition hebdomadaire préserve les repas et valide tout avant écriture', async t => {
  const db = createDatabase(':memory:');
  const server = createApp(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const meal = (date, recipeId = 1) => ({ date, slot: 'soir', location: 'home', occasion: 'regular', people: 2, recipeId, title: 'Menu', assignments: [], dishes: [] });
  const start = '2026-09-14';
  await post('/api/meals', { ...meal(start), title: 'Date réservé', occasion: 'date', recipeId: null });
  assert.equal((await post('/api/week/plan', { start, meals: [meal('2026-09-15'), meal(start)] })).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM meals').get().count, 1);
  assert.equal((await post('/api/week/plan', { start, meals: [meal('2026-09-15'), meal('2026-09-16', 999)] })).status, 400);
  assert.equal((await post('/api/week/plan', { start, meals: [meal('2026-09-15'), meal('2026-09-15')] })).status, 400);
  assert.equal((await post('/api/week/plan', { start, meals: [meal('2026-09-21')] })).status, 400);
  const member = await (await post('/api/members', { name: 'Julie', diet: 'vegan' })).json();
  assert.equal((await post('/api/week/plan', { start, meals: [meal('2026-09-15')] })).status, 400);
  const vegan = await (await post('/api/recipes', { title: 'Carottes', minutes: 15, servings: 2, diet: 'vegan', tags: [], ingredients: [{ name: 'carotte', amount: 4, unit: 'pièce' }], steps: [{ kind: 'cook', instruction: 'Cuire les carottes.', minutes: 15 }] })).json();
  const shared = { ...meal('2026-09-15'), recipeId: null, dishes: [{ memberId: member.id, recipeId: vegan.id, portions: 1 }] };
  const response = await post('/api/week/plan', { start, meals: [shared, { ...shared, date: '2026-09-16' }] });
  assert.deepEqual(await response.json(), { added: 2 });
  assert.equal(db.prepare('SELECT title FROM meals WHERE date = ?').get(start).title, 'Date réservé');
  assert.equal(shoppingList(db, start).find(item => item.name === 'carotte').amount, 4);
  const week = await (await fetch(`${base}/api/week?start=${start}`)).json();
  assert.equal(week.meals[1].minutes, 15);
  assert.equal(week.meals[1].dishes[0].recipeId, vegan.id);
  assert.equal((await post('/api/week/plan', { start, meals: [shared] })).status, 400);
  db.exec("CREATE TRIGGER fail_test_menu BEFORE INSERT ON meals WHEN NEW.date = '2026-09-18' BEGIN SELECT RAISE(ABORT, 'test rollback'); END;");
  assert.equal((await post('/api/week/plan', { start, meals: [{ ...shared, date: '2026-09-17' }, { ...shared, date: '2026-09-18' }] })).status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM meals WHERE date >= '2026-09-17'").get().count, 0);
});

test('un date à la maison conserve sa recette et ajoute les ingrédients aux courses', async t => {
  const db = createDatabase(':memory:');
  const server = createApp(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/meals`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date: '2026-09-14', slot: 'soir', location: 'home', occasion: 'date', people: 2, recipeId: 1, title: 'Date maison', assignments: [], dishes: [] })
  });
  assert.equal(response.status, 200);
  const week = await (await fetch(`${base}/api/week?start=2026-09-14`)).json();
  assert.equal(week.meals[0].occasion, 'date');
  assert.equal(week.meals[0].recipeId, 1);
  assert.ok(shoppingList(db, '2026-09-14').some(item => item.name === 'pois chiches' && item.amount === 400));
});

test('le catalogue importe 14 recettes complètes sans doublon ni remplacement', async t => {
  const db = createDatabase(':memory:');
  const server = createApp(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = await (await fetch(`${base}/api/week?start=2026-09-14`)).json();
  const imported = await fetch(`${base}/api/catalog/import`, { method: 'POST' });
  assert.equal(imported.status, 200);
  assert.deepEqual(await imported.json(), { added: 14 });
  assert.deepEqual(await (await fetch(`${base}/api/catalog/import`, { method: 'POST' })).json(), { added: 0 });
  const final = await (await fetch(`${base}/api/week?start=2026-09-14`)).json();
  assert.equal(final.recipes.length, initial.recipes.length + 14);
  for (const recipe of initial.recipes) assert.deepEqual(final.recipes.find(item => item.id === recipe.id), recipe);
  const recipes = final.recipes.filter(recipe => !initial.recipes.some(item => item.id === recipe.id));
  for (const recipe of recipes) {
    assert.ok(recipe.ingredients.length >= 4);
    assert.ok(recipe.steps.length >= 3);
    assert.ok(recipe.minutes > 0);
  }
  for (const tag of ['rat', 'date', 'mijote', 'japon', 'chine', 'terroir', 'chef']) assert.ok(recipes.some(recipe => recipe.tags.includes(tag)));
  for (const tag of ['express', 'batch', 'emporter', 'comfort', 'mediterranee', 'italie', 'inde']) assert.ok(recipes.some(recipe => recipe.tags.includes(tag)));
  assert.ok(recipes.filter(recipe => recipe.tags.includes('express')).every(recipe => recipe.minutes <= 30));
});

test('la migration corrige le régime des gnocchis dans une base existante', t => {
  const directory = mkdtempSync(join(tmpdir(), 'manger-'));
  const filename = join(directory, 'manger.db');
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  let db = createDatabase(filename);
  db.prepare("UPDATE recipes SET diet = 'omnivore' WHERE title = 'Gnocchis aux légumes'").run();
  db.exec('PRAGMA user_version = 0');
  db.close();

  db = createDatabase(filename);
  assert.equal(db.prepare("SELECT diet FROM recipes WHERE title = 'Gnocchis aux légumes'").get().diet, 'vegetarian');
  db.close();
});

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

  const antiWasteRecipe = await fetch(`${baseUrl}/api/recipes`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Tomates farcies au riz', minutes: 35, servings: 2, diet: 'vegetarian', tags: ['anti-gaspi'],
      ingredients: [{ name: 'tomate', amount: 2, unit: 'pièce' }, { name: 'riz', amount: 160, unit: 'g' }],
      steps: [{ kind: 'cook', instruction: 'Farcir les tomates et cuire.', minutes: 30 }]
    })
  });
  assert.equal(antiWasteRecipe.status, 201);
  const antiWasteSuggestions = await (await fetch(`${baseUrl}/api/suggestions?start=2026-09-14`)).json();
  assert.equal(antiWasteSuggestions[0].title, 'Tomates farcies au riz');
  assert.deepEqual(antiWasteSuggestions[0].reusedIngredients, ['tomate']);

  const checked = await fetch(`${baseUrl}/api/shopping-checks`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ weekStart: '2026-09-14', name: 'citron', unit: 'pièce', checked: true })
  });
  assert.equal(checked.status, 200);
  const week = await (await fetch(`${baseUrl}/api/week?start=2026-09-14`)).json();
  assert.equal(week.shopping.find(item => item.name === 'citron').checked, true);

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
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/restaurants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
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
  assert.deepEqual(updated.ingredients, [{ name: 'tomate', unit: 'pièce', amount: 2, preparation: 'unknown' }]);
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

test('les suggestions respectent le temps disponible et tout le foyer', () => {
  const db = createDatabase(':memory:');
  db.prepare("INSERT INTO members (name, diet) VALUES ('Julie', 'pescetarian'), ('Romain', 'omnivore')").run();
  db.prepare("UPDATE recipes SET diet = 'omnivore' WHERE title = 'Curry coco'").run();

  assert.deepEqual(suggestions(db, null, 24).map(recipe => recipe.title), ['Bowl pois chiches']);
  assert.equal(suggestions(db).some(recipe => recipe.title === 'Curry coco'), false);
  db.close();
});

test('un membre du foyer peut être modifié puis retiré', async t => {
  const server = createApp(createDatabase(':memory:'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const created = await (await fetch(`${baseUrl}/api/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Camille', diet: 'vegetarian' }) })).json();
  const updated = await fetch(`${baseUrl}/api/members/${created.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Cam', diet: 'pescetarian' }) });
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { id: created.id, name: 'Cam', diet: 'pescetarian' });

  assert.equal((await fetch(`${baseUrl}/api/members/${created.id}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/household`)).json()).members, []);
});

test('une protéine peut être gérée sans casser les régimes planifiés', async t => {
  const server = createApp(createDatabase(':memory:'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method, body) => fetch(`${baseUrl}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });

  const created = await (await request('/api/proteins', 'POST', { name: 'Seitan', category: 'plant', amount: 120, unit: 'g' })).json();
  const updated = await request(`/api/proteins/${created.id}`, 'PUT', { name: 'Seitan grillé', category: 'plant', amount: 140, unit: 'g' });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).amount, 140);
  assert.equal((await request(`/api/proteins/${created.id}`, 'DELETE')).status, 200);

  const member = await (await request('/api/members', 'POST', { name: 'Julie', diet: 'vegetarian' })).json();
  const tofu = (await (await fetch(`${baseUrl}/api/household`)).json()).proteins.find(protein => protein.name === 'tofu');
  await request('/api/meals', 'POST', { date: '2026-09-14', slot: 'soir', location: 'home', occasion: 'regular', people: 1, recipeId: 1, title: 'Bowl', assignments: [{ memberId: member.id, proteinId: tofu.id, portions: 1 }] });
  assert.equal((await request(`/api/proteins/${tofu.id}`, 'PUT', { ...tofu, category: 'meat' })).status, 400);
  assert.equal((await request(`/api/proteins/${tofu.id}`, 'DELETE')).status, 400);
});

test('une recette libre peut être supprimée mais pas une recette planifiée', async t => {
  const server = createApp(createDatabase(':memory:'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method, body) => fetch(`${baseUrl}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const recipe = { title: 'Test à supprimer', minutes: 10, servings: 1, diet: 'vegan', tags: [], ingredients: [{ name: 'tomate', amount: 1, unit: 'pièce' }], steps: [{ kind: 'prep', instruction: 'Couper.', minutes: 2 }] };

  const created = await (await request('/api/recipes', 'POST', recipe)).json();
  assert.equal((await request(`/api/recipes/${created.id}`, 'DELETE')).status, 200);
  assert.equal((await request(`/api/recipes/${created.id}`, 'DELETE')).status, 400);

  await request('/api/meals', 'POST', { date: '2026-09-14', slot: 'soir', location: 'home', occasion: 'regular', people: 2, recipeId: 1, title: 'Bowl', assignments: [] });
  assert.equal((await request('/api/recipes/1', 'DELETE')).status, 400);
});

test('la semaine peut être exportée dans un calendrier standard', async t => {
  const server = createApp(createDatabase(':memory:'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${baseUrl}/api/meals`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date: '2026-09-14', slot: 'soir', location: 'home', occasion: 'regular', people: 2, recipeId: 1, title: 'Bowl, pois chiches', assignments: [] }) });

  const response = await fetch(`${baseUrl}/api/calendar.ics?start=2026-09-14`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/calendar/);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="manger-2026-09-14.ics"');
  assert.match(body, /DTSTART;VALUE=DATE:20260914\r\nDTEND;VALUE=DATE:20260915/);
  assert.match(body, /SUMMARY:Soir — Bowl\\, pois chiches/);
});

test('les restaurants OpenStreetMap sont normalisés et triés par distance', () => {
  const results = restaurantResults([
    { type: 'way', id: 2, center: { lat: 50.3, lon: 2.8 }, tags: { name: 'Plus loin', cuisine: 'french;regional' } },
    { type: 'node', id: 1, lat: 50.291, lon: 2.78, tags: { name: 'Tout près' } },
    { type: 'node', id: 3, lat: 50.29, lon: 2.78, tags: {} }
  ], 50.29, 2.78);

  assert.deepEqual(results.map(restaurant => restaurant.name), ['Tout près', 'Plus loin']);
  assert.equal(results[1].cuisine, 'french, regional');
});

test('la recherche de restaurants interroge le service configuré', async t => {
  const overpass = createServer((request, response) => {
    request.resume();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ elements: [{ type: 'node', id: 42, lat: 50.291, lon: 2.78, tags: { name: 'Le Petit Jardin', cuisine: 'french' } }] }));
  });
  overpass.listen(0, '127.0.0.1');
  await once(overpass, 'listening');
  t.after(() => overpass.close());

  const server = createApp(createDatabase(':memory:'), `http://127.0.0.1:${overpass.address().port}`);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/restaurants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ latitude: 50.29, longitude: 2.78 }) });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).map(restaurant => restaurant.name), ['Le Petit Jardin']);
});

test('ville et code postal proposent les communes sans demander de géolocalisation', async t => {
  const queries = [];
  const provider = createServer((request, response) => {
    queries.push(new URL(request.url, 'http://localhost').searchParams);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify([{ nom: 'Arras', code: '62041', codesPostaux: ['62000'], centre: { coordinates: [2.78, 50.29] } }]));
  });
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  t.after(() => provider.close());
  const server = createApp(createDatabase(':memory:'), 'http://localhost', `http://127.0.0.1:${provider.address().port}/communes`);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/places?query=62000`);
  assert.deepEqual(await response.json(), [{ name: 'Arras', code: '62041', postalCodes: ['62000'], longitude: 2.78, latitude: 50.29 }]);
  await fetch(`${base}/api/places?query=Arras`);
  assert.equal(queries[0].get('codePostal'), '62000');
  assert.equal(queries[1].get('nom'), 'Arras');
  assert.equal((await fetch(`${base}/api/places?query=`)).status, 400);
});
