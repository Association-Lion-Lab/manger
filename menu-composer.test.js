const test = require('node:test');
const assert = require('node:assert/strict');
const { availableSlots, planPayload } = require('./public/menu-composer');
const { planMeals } = require('./planning');
const start = '2026-11-02';
const recipes = [{ id: 1, title: 'Riz', diet: 'vegan' }, { id: 2, title: 'Soupe', diet: 'vegan' }];
const members = [{ id: 7, name: 'A', diet: 'vegan' }, { id: 8, name: 'B', diet: 'omnivore' }];
const row = patch => ({ recipeId: 1, day: 0, slot: 'soir', people: 2, memberIds: [7, 8], ...patch });
const payload = rows => planPayload({ start, rows, recipes, members, meals: [] });

test('menu : créneaux libres, cinq soirs initiaux, aucune modification du planning reçu', () => {
  const meals = [{ date: start, slot: 'soir' }], copy = JSON.stringify(meals);
  const slots = availableSlots(start, meals);
  assert.equal(slots.length, 13);
  assert.deepEqual(slots[0], { day: 1, slot: 'soir' });
  assert.equal(JSON.stringify(meals), copy);
});

test('menu : deux recettes le même jour, portions et contrat serveur conservés', () => {
  const result = payload([row({ people: 4 }), row({ recipeId: 2, slot: 'midi' })]);
  assert.equal(result.meals.length, 2);
  assert.deepEqual(result.meals[0].dishes, [{ memberId: 7, recipeId: 1, portions: 2 }, { memberId: 8, recipeId: 1, portions: 2 }]);
  assert.doesNotThrow(() => planMeals(result, { recipes, members, proteins: [] }));
});

test('menu : plusieurs plats au même repas pour des profils différents', () => {
  const result = payload([row({ memberIds: [7], people: 2 }), row({ recipeId: 2, memberIds: [8], people: 1 })]);
  assert.equal(result.meals.length, 1);
  assert.equal(result.meals[0].people, 3);
  assert.deepEqual(result.meals[0].dishes, [{ memberId: 7, recipeId: 1, portions: 2 }, { memberId: 8, recipeId: 2, portions: 1 }]);
  assert.doesNotThrow(() => planMeals(result, { recipes, members, proteins: [] }));
});

test('menu : conflits, participant répété, portions et références invalides refusés', () => {
  assert.throws(() => payload([row(), row({ recipeId: 2 })]), /plusieurs plats|deux plats/i);
  assert.throws(() => payload([row({ people: 3 })]), /portions/i);
  assert.throws(() => payload([row({ recipeId: 99 })]), /recette/i);
  assert.throws(() => payload([row({ memberIds: [99] })]), /participant/i);
  assert.throws(() => payload([row({ day: 7 })]), /jour|créneau/i);
  assert.throws(() => planPayload({ start, rows: [row()], recipes, members, meals: [{ date: start, slot: 'soir' }] }), /déjà prévu|occupé/i);
});

test('menu : sans profil, recette partagée et portions libres, pas deux recettes au même créneau', () => {
  const rows = [row({ memberIds: [], people: 3 })];
  const result = planPayload({ start, rows, recipes, members: [], meals: [] });
  assert.equal(result.meals[0].recipeId, 1);
  assert.equal(result.meals[0].people, 3);
  assert.deepEqual(result.meals[0].dishes, []);
  assert.throws(() => planPayload({ start, rows: [...rows, row({ recipeId: 2, memberIds: [], people: 2 })], recipes, members: [], meals: [] }), /profil|autre repas/i);
});
