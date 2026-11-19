const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { previewMenu } = require('./calculations');
const { planPayload } = require('./public/menu-composer');
const { createApp, createDatabase } = require('./server');

// Profils fictifs uniquement.
const alex = { id: 1, name: 'Alex', diet: 'omnivore', avoidedIngredients: [] };
const sam = { id: 2, name: 'Sam', diet: 'pescetarian', avoidedIngredients: [] };
const start = '2026-11-16';
const recipe = (id, diet = 'vegan', name = `aliment ${id}`) => ({ id, title: `Plat ${String(id).padStart(2, '0')}`, minutes: 10, servings: 1, diet, ingredients: [{ name, unit: 'g', amount: 100 }] });
const recipes = (count, diet = 'vegan', from = 1) => Array.from({ length: count }, (_, i) => recipe(from + i, diet));
const data = (list, extra = {}) => ({ recipes: list, home: { members: [], avoidedIngredients: [] }, stocks: [], items: [], meals: [], ...extra });
const input = (count = 5, extra = {}) => ({ start, maxMinutes: 30, people: 1, memberIds: [], slots: Array.from({ length: count }, (_, day) => ({ day, slot: 'soir' })), ...extra });
const seeded = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ids = menu => menu.map(item => item.recipeId);
const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

test('variété : pas deux fois la même recette dans la semaine tant qu’une autre existe', () => {
  const week = data(recipes(6), { meals: [{ date: '2026-11-22', slot: 'midi', recipeId: 1, dishes: [] }] });
  for (const seed of seeds) assert.deepEqual(ids(previewMenu(week, input(), seeded(seed))).sort((a, b) => a - b), [2, 3, 4, 5, 6], `graine ${seed}`);
  const short = previewMenu(data(recipes(2)), input(3), seeded(1));
  assert.ok([1, 2].every(id => ids(short).filter(value => value === id).length <= 2), 'doublon seulement faute de choix');
});

test('variété : roulement sur les 21 jours précédant la semaine, plats séparés compris', () => {
  const eaten = [
    { date: '2026-11-15', slot: 'soir', recipeId: 1, dishes: [] }, { date: '2026-10-26', slot: 'soir', recipeId: 2, dishes: [] },
    { date: '2026-11-10', slot: 'midi', recipeId: null, dishes: [{ memberId: 1, recipeId: 3 }, { memberId: 2, recipeId: 4 }] },
    { date: '2026-11-01', slot: 'midi', recipeId: 5, dishes: [] }, { date: '2026-10-25', slot: 'soir', recipeId: 6, dishes: [] }
  ];
  for (const seed of seeds) assert.deepEqual(ids(previewMenu(data(recipes(10), { meals: eaten }), input(), seeded(seed))).sort((a, b) => a - b), [6, 7, 8, 9, 10], `graine ${seed}`);
  const all = previewMenu(data(recipes(5), { meals: eaten }), input(5), seeded(3));
  assert.equal(new Set(ids(all)).size, 5, 'une recette récente reste possible quand il n’y a pas mieux');
});

test('variété : tirage injectable, reproductible, et Math.random par défaut', () => {
  const week = data(recipes(15));
  assert.deepEqual(previewMenu(week, input(), seeded(7)), previewMenu(week, input(), seeded(7)));
  assert.notDeepEqual(ids(previewMenu(week, input(), seeded(7))), ids(previewMenu(week, input(), seeded(8))));
  assert.equal(previewMenu(week, input()).length, 5);
  const reversed = data([...recipes(15)].reverse());
  assert.deepEqual(previewMenu(reversed, input(), seeded(7)), previewMenu(week, input(), seeded(7)), 'ordre physique sans effet');
});

test('variété : le placard augmente les chances sans imposer, l’urgent reste prioritaire', () => {
  const stock = (name, useBy) => ({ id: name.length, name, unit: 'g', amount: 500, explicitLot: 1, recordedOn: '2026-11-01', useBy });
  const pair = data([recipe(1), recipe(2, 'vegan', 'carotte')], { stocks: [stock('carotte', '2026-12-31')] });
  const one = input(1);
  assert.equal(previewMenu(pair, one, () => 0.2)[0].recipeId, 1, 'poids 1 contre 2 : le tirage bas garde le premier');
  assert.equal(previewMenu(pair, one, () => 0.4)[0].recipeId, 2, 'le plat couvert par le placard a deux fois plus de chances');
  const urgent = data(recipes(10), { stocks: [stock('aliment 9', '2026-11-17')], meals: [{ date: '2026-11-14', slot: 'soir', recipeId: 9, dishes: [] }] });
  for (const seed of seeds) assert.equal(previewMenu(urgent, input(), seeded(seed))[0].recipeId, 9, `graine ${seed}`);
  urgent.home.avoidedIngredients = ['aliment 9'];
  for (const seed of seeds) assert.ok(!ids(previewMenu(urgent, input(), seeded(seed))).includes(9), 'les goûts passent avant l’anti-gaspi');
});

test('foyer mixte : 5 repas = 3 communs compatibles avec tous + 2 séparés avec de la viande pour l’omnivore', () => {
  const home = { members: [alex, sam], avoidedIngredients: [] };
  const catalog = [...recipes(4, 'vegan'), ...recipes(3, 'pescetarian', 5), ...recipes(3, 'omnivore', 8)];
  const diet = id => catalog.find(item => item.id === id).diet;
  for (const seed of seeds) {
    const menu = previewMenu(data(catalog, { home }), input(5, { memberIds: [1, 2] }), seeded(seed));
    const meals = [0, 1, 2, 3, 4].map(day => menu.filter(item => item.day === day));
    assert.deepEqual(meals.map(dishes => dishes.length), [1, 2, 1, 2, 1], `graine ${seed}`);
    for (const [shared] of [meals[0], meals[2], meals[4]]) { assert.equal(shared.memberIds, undefined); assert.notEqual(diet(shared.recipeId), 'omnivore'); }
    for (const dishes of [meals[1], meals[3]]) {
      assert.deepEqual(dishes.map(item => item.memberIds), [[2], [1]], 'le plus strict d’abord');
      assert.notEqual(diet(dishes[0].recipeId), 'omnivore');
      assert.equal(diet(dishes[1].recipeId), 'omnivore');
    }
    assert.equal(new Set(ids(menu)).size, 7, 'aucun doublon entre plats communs et séparés');
  }
  const noMeat = previewMenu(data(recipes(8), { home }), input(5, { memberIds: [1, 2] }), seeded(1));
  assert.equal(noMeat.filter(item => item.day === 1).length, 2, 'repli : repas séparé avec une recette compatible faute de viande');
  const same = previewMenu(data(catalog, { home: { members: [alex, { ...sam, diet: 'omnivore' }], avoidedIngredients: [] } }), input(5, { memberIds: [1, 2] }), seeded(1));
  assert.equal(same.length, 5); assert.ok(same.every(item => item.memberIds === undefined), 'un seul régime : aucun repas séparé');
  const onlySam = previewMenu(data(catalog, { home }), input(5, { memberIds: [2] }), seeded(1));
  assert.ok(onlySam.every(item => item.memberIds === undefined && diet(item.recipeId) !== 'omnivore'));
});

test('foyer mixte : bascule par repas, plats fixés conservés et validés', () => {
  const home = { members: [alex, sam], avoidedIngredients: [] };
  const catalog = [...recipes(4, 'vegan'), ...recipes(3, 'pescetarian', 5), ...recipes(3, 'omnivore', 8)];
  const run = slots => previewMenu(data(catalog, { home }), { ...input(), memberIds: [1, 2], slots }, seeded(2));
  const toggled = run([{ day: 0, slot: 'soir', split: true }, { day: 1, slot: 'soir', split: false }]);
  assert.deepEqual(toggled.map(item => [item.day, item.memberIds]), [[0, [2]], [0, [1]], [1, undefined]]);
  const fixed = run([{ day: 0, slot: 'soir', dishes: [{ memberIds: [1], recipeId: 9 }, { memberIds: [2], recipeId: 5 }] }, { day: 1, slot: 'soir', recipeId: 1 }, { day: 2, slot: 'soir' }]);
  assert.deepEqual(fixed.slice(0, 3).map(item => [item.recipeId, item.memberIds]), [[9, [1]], [5, [2]], [1, undefined]]);
  assert.ok(![9, 5, 1].includes(fixed[3].recipeId));
  for (const dishes of [[{ memberIds: [2], recipeId: 9 }], [{ memberIds: [1, 2], recipeId: 1 }, { memberIds: [2], recipeId: 2 }], [], [{ memberIds: [], recipeId: 1 }], [{ memberIds: [3], recipeId: 1 }]]) {
    assert.throws(() => run([{ day: 0, slot: 'soir', dishes }]), /Plats du repas|critères/);
  }
  assert.throws(() => run([{ day: 0, slot: 'soir', split: 'oui' }]), /Créneau/);
  assert.throws(() => run([{ day: 0, slot: 'soir', recipeId: 9 }]), /critères/, 'un plat commun reste compatible avec tous');
  assert.throws(() => previewMenu(data(catalog), input(1, { slots: [{ day: 0, slot: 'soir', dishes: [{ memberIds: [1], recipeId: 1 }] }] })), /Plats du repas/);
});

test('foyer mixte : aperçu puis enregistrement HTTP d’un menu avec plats séparés', async t => {
  const db = createDatabase(':memory:'); db.exec('DELETE FROM recipes');
  const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value;
  };
  const members = [await post('/api/members', { name: 'Alex', diet: 'omnivore' }), await post('/api/members', { name: 'Sam', diet: 'pescetarian' })];
  const created = [];
  for (const [title, diet] of [['Lentilles', 'vegan'], ['Riz sauté', 'vegan'], ['Gratin', 'vegetarian'], ['Saumon', 'pescetarian'], ['Thon', 'pescetarian'], ['Poulet', 'omnivore'], ['Bœuf', 'omnivore']]) {
    created.push(await post('/api/recipes', { title, minutes: 10, servings: 2, diet, tags: [], ingredients: [{ name: title.toLowerCase(), amount: 200, unit: 'g' }], steps: [{ kind: 'prep', instruction: 'Préparer.' }] }));
  }
  const memberIds = members.map(member => member.id);
  const choices = await post('/api/week/preview', { start, maxMinutes: 30, people: 2, memberIds, slots: [0, 1, 2, 3, 4].map(day => ({ day, slot: 'soir' })) });
  assert.equal(choices.filter(item => item.memberIds).length, 4);
  const rows = choices.map(item => ({ day: item.day, slot: item.slot, recipeId: item.recipeId, memberIds: item.memberIds || memberIds, people: (item.memberIds || memberIds).length }));
  const plan = planPayload({ start, rows, recipes: created, members, meals: [] });
  assert.deepEqual(await post('/api/week/plan', plan), { added: 5 });
  const week = await (await fetch(`${base}/api/week?start=${start}`)).json();
  const split = week.meals.filter(meal => new Set(meal.dishes.map(dish => dish.recipeId)).size === 2);
  assert.equal(split.length, 2);
  for (const meal of split) {
    const alexDish = meal.dishes.find(dish => dish.memberId === members[0].id);
    assert.equal(created.find(item => item.id === alexDish.recipeId).diet, 'omnivore');
    assert.equal(meal.title, 'Un plat par personne');
  }
});

test('foyer mixte : 12 repas dont 5 séparés, plafond compté en repas de l’aperçu à l’enregistrement', async t => {
  const db = createDatabase(':memory:'); db.exec('DELETE FROM recipes');
  const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value;
  };
  const members = [await post('/api/members', { name: 'Alex', diet: 'omnivore' }), await post('/api/members', { name: 'Sam', diet: 'pescetarian' })];
  const created = [];
  for (const [index, diet] of [...Array(12).fill('pescetarian'), ...Array(5).fill('omnivore')].entries()) {
    created.push(await post('/api/recipes', { title: `Plat ${index}`, minutes: 10, servings: 2, diet, tags: [], ingredients: [{ name: `aliment ${index}`, amount: 200, unit: 'g' }], steps: [{ kind: 'prep', instruction: 'Préparer.' }] }));
  }
  const memberIds = members.map(member => member.id);
  const slots = [...[0, 1, 2, 3, 4, 5, 6].map(day => ({ day, slot: 'soir' })), ...[0, 1, 2, 3, 4].map(day => ({ day, slot: 'midi' }))];
  const choices = await post('/api/week/preview', { start, maxMinutes: 30, people: 2, memberIds, slots });
  assert.equal(choices.length, 17, '7 communs + 5 repas séparés de deux plats');
  const rows = choices.map(item => ({ day: item.day, slot: item.slot, recipeId: item.recipeId, memberIds: item.memberIds || memberIds, people: (item.memberIds || memberIds).length }));
  const plan = planPayload({ start, rows, recipes: created, members, meals: [] });
  assert.equal(plan.meals.length, 12);
  assert.deepEqual(await post('/api/week/plan', plan), { added: 12 });
  const extra = slots.concat([5, 6].map(day => ({ day, slot: 'midi' })), [{ day: 6, slot: 'midi' }]).map(slot => ({ ...slot, recipeId: created[0].id, memberIds, people: 2 }));
  assert.throws(() => planPayload({ start, rows: [], recipes: created, members, meals: [] }), /repas/);
  assert.throws(() => planPayload({ start, rows: extra, recipes: created, members, meals: [] }), /deux plats|plusieurs plats/, '15 lignes sur 14 créneaux : un créneau répété');
});
