const test = require('node:test');
const assert = require('node:assert/strict');
const { foodName, foodSuggestions, searchRecipes } = require('./public/food-names');
const { groupIngredients } = require('./ingredients');

test('noms alimentaires : variantes connues seulement, accents et pluriels sans retirer tous les s', () => {
  for (const [input, expected] of [[' COncombres ', 'concombre'], ['poireaux', 'poireau'], ['OEUFS', 'œuf'], ['peches', 'pêche'], ['pommes   de terre', 'pomme de terre'], ['MAIS', 'maïs'], ['pois', 'pois'], ['ananas', 'ananas'], ['radis', 'radis']]) assert.equal(foodName(input), expected);
  assert.notEqual(foodName('tomates'), foodName('tomates concassées'));
  assert.notEqual(foodName('tofu'), foodName('tofu fumé'));
  assert.notEqual(foodName('sel'), foodName('sels inconnus'));
  assert.equal(foodName('concomrbe'), 'concomrbe');
  assert.equal(groupIngredients([{ name: 'concombre', amount: 100, unit: 'g' }, { name: 'CONCOMBRES', amount: 0.2, unit: 'kg' }])[0].amount, 300);
});

test('corrections proposées : permutation, lettres manquantes et ajoutées, noms privés, aucune fusion automatique', () => {
  assert.ok(foodSuggestions('concomrbe').includes('concombre'));
  assert.ok(foodSuggestions('courgetess').includes('courgette'));
  assert.ok(foodSuggestions('concombrex').includes('concombre'));
  assert.ok(foodSuggestions('sarrasin grille', ['sarrasin grillé']).length === 0);
  assert.ok(foodSuggestions('sarrasni grillé', ['sarrasin grillé']).includes('sarrasin grillé'));
  for (const word of ['riz', 'sel', 'pois', 'maïs', 'tomates', 'concombres', '', 'x'.repeat(81)]) assert.deepEqual(foodSuggestions(word), []);
  assert.equal(foodSuggestions('tomate concassee').includes('tomate'), false);
  assert.equal(foodSuggestions('tofu fume').includes('tofu'), false);
  assert.ok(foodSuggestions('courgete').length <= 3);
});

test('recherche de recettes : accents, pluriels, fautes en repli et priorité aux résultats exacts', () => {
  const recipes = [
    { title: 'Salade fraîche', ingredients: [{ name: 'concombre' }] },
    { title: 'Œufs brouillés', ingredients: [{ name: 'œuf' }] },
    { title: 'Tarte aux pommes', ingredients: [{ name: 'pomme' }] },
    { title: 'Compote de poires', ingredients: [{ name: 'poire' }] }
  ];
  for (const word of ['concombres', 'concomrbe', 'salade fraiche']) assert.deepEqual(searchRecipes(recipes, word), [recipes[0]]);
  assert.deepEqual(searchRecipes(recipes, 'oeufs'), [recipes[1]]);
  assert.deepEqual(searchRecipes(recipes, 'pommes'), [recipes[2]]);
  assert.deepEqual(searchRecipes(recipes, 'poire'), [recipes[3]]);
  assert.deepEqual(searchRecipes(recipes, 'aliment totalement inconnu'), []);
  assert.deepEqual(searchRecipes(recipes, ''), recipes);
});

test('recherche de recettes : le temps maximal filtre avant les mots et les fautes', () => {
  const recipes = [
    { title: 'Salade de tomates', minutes: 20, ingredients: [{ name: 'tomate' }] },
    { title: 'Tomates farcies', minutes: 80, ingredients: [{ name: 'tomate' }] }
  ];
  assert.deepEqual(searchRecipes(recipes, '', 30), [recipes[0]]);
  assert.deepEqual(searchRecipes(recipes, 'tomates', 30), [recipes[0]]);
  assert.deepEqual(searchRecipes(recipes, 'farcies', 30), []);
  assert.deepEqual(searchRecipes(recipes, 'tomates'), recipes);
});
