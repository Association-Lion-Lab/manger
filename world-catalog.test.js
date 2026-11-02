const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('./catalog');
const { recipeSeason } = require('./public/seasons');
const { createDatabase, recipes, saveRecipe, validateRecipe } = require('./server');
const { sqliteRecipes } = require('./db/recipes-sqlite');

test('lot de 50 : quatre régimes et couverture des quinze univers existants', () => {
  const additions = catalog.slice(128);
  assert.equal(additions.length, 50);
  assert.deepEqual(additions.reduce((counts, item) => {
    counts[item.diet] = (counts[item.diet] || 0) + 1;
    return counts;
  }, {}), { vegetarian: 17, vegan: 17, pescetarian: 9, omnivore: 7 });
  for (const tag of ['rat', 'date', 'mijote', 'japon', 'chine', 'terroir', 'chef', 'express', 'batch', 'emporter', 'comfort', 'mediterranee', 'italie', 'inde', 'mexique']) {
    assert.ok(additions.filter(item => item.tags.includes(tag)).length >= 3, tag);
  }
  for (const item of additions) {
    for (const tag of item.tags) assert.ok(catalog.slice(0, 128).some(old => old.tags.includes(tag)), `${item.title}: ${tag}`);
    assert.equal(Object.hasOwn(item, 'rating'), false, item.title);
    assert.equal(Object.hasOwn(item, 'price'), false, item.title);
    if (item.ingredients.some(part => /poulet|dinde/u.test(part.name))) {
      assert.ok(item.steps.some(step => step.instruction.includes('74 °C')), item.title);
    }
  }
});

test('lot de 50 : légumes frais reconnus au bon mois sans saison forcée par le titre', () => {
  for (const [title, month, opposite] of [
    ['Salade de soba au tofu et radis', 5, 8],
    ['Frittata aux courgettes et ricotta', 8, 1],
    ['Saumon en croûte de moutarde et brocoli', 10, 6],
    ['Pâtes au chou et à l’ail', 1, 8],
  ]) {
    const item = catalog.find(recipe => recipe.title === title);
    assert.ok(item, title);
    assert.equal(recipeSeason(item, month).matches, true, title);
    assert.equal(recipeSeason(item, opposite).matches, false, title);
  }
  const salad = catalog.find(item => item.title === 'Salade de soba au tofu et radis');
  assert.equal(salad.ingredients.find(item => item.name === 'radis').preparation, 'raw');
  assert.equal(salad.ingredients.find(item => item.name === 'tofu ferme').preparation, 'cooked');
});

test('un légume saisonnier du lot ne forme pas une combinaison fraîche impossible toute l’année', () => {
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  for (const item of catalog.slice(128)) {
    const hasSeasonalProduce = item.ingredients.some(part => months.some(month => recipeSeason({ ingredients: [part] }, month).matches));
    if (hasSeasonalProduce) assert.ok(months.some(month => recipeSeason(item, month).matches), item.title);
  }
});

test('import depuis 128 : 50 ajouts, photo et favoris conservés, répétition sans doublon', async t => {
  const db = createDatabase(':memory:');
  t.after(() => db.close());
  for (const item of catalog.slice(0, 128)) saveRecipe(db, validateRecipe(item));
  const store = sqliteRecipes(db);
  const customized = await store.save(validateRecipe({ ...catalog[0], minutes: 77, photo: 'data:image/jpeg;base64,/9j/2Q==' }), recipes(db).find(item => item.title === catalog[0].title).id);
  await store.setFavorite(customized.id, true);
  const before = recipes(db);
  assert.equal(await store.importCatalog(catalog.map(validateRecipe)), 50);
  const after = recipes(db);
  assert.equal(after.length, before.length + 50);
  for (const item of before) assert.deepEqual(after.find(saved => saved.id === item.id), item);
  assert.equal(await store.importCatalog(catalog.map(validateRecipe)), 0);
  assert.deepEqual(recipes(db), after);
});
