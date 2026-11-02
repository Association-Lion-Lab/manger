const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('./catalog');
const { createDatabase, recipes, saveRecipe, validateRecipe } = require('./server');
const { sqliteRecipes } = require('./db/recipes-sqlite');

test('huit mijotés classiques ajoutés, bœuf-carottes existant conservé sans doublon', () => {
  assert.deepEqual(catalog.slice(120, 128).map(item => item.title), [
    'Bœuf bourguignon', 'Carbonade flamande', 'Joues de porc au cidre',
    'Joues de porc à la moutarde et aux champignons', 'Blanquette de dinde aux champignons',
    'Pot-au-feu de bœuf aux légumes', 'Sauté de porc façon Marengo', 'Daube de bœuf aux olives',
  ]);
  assert.equal(catalog.filter(item => item.title === 'Bœuf carottes du dimanche').length, 1);
  for (const item of catalog.slice(120, 128)) {
    assert.equal(item.diet, 'omnivore', item.title);
    assert.ok(item.tags.includes('mijote'), item.title);
    assert.ok(item.steps.some(step => step.kind === 'cook' && step.minutes >= 45), item.title);
    assert.ok(item.steps.some(step => /tendre|fourchette|fondante/u.test(step.instruction)), item.title);
  }
});

test('liquides alcoolisés et accompagnements sont quantifiés dans les fiches concernées', () => {
  for (const [title, liquid] of [
    ['Bœuf bourguignon', 'vin rouge'], ['Carbonade flamande', 'bière brune'],
    ['Joues de porc au cidre', 'cidre brut'], ['Sauté de porc façon Marengo', 'vin blanc'],
    ['Daube de bœuf aux olives', 'vin rouge'],
  ]) {
    const item = catalog.find(recipe => recipe.title === title);
    assert.ok(item?.ingredients.some(part => part.name === liquid && part.unit === 'ml' && part.amount > 0), title);
  }
  const poultry = catalog.find(item => item.title === 'Blanquette de dinde aux champignons');
  assert.ok(poultry?.steps.some(step => step.instruction.includes('74 °C')));
});

test('import depuis 120 fiches : 58 ajouts, répétition sans doublon et personnalisation gardée', async t => {
  const db = createDatabase(':memory:');
  t.after(() => db.close());
  for (const item of catalog.slice(0, 120)) saveRecipe(db, validateRecipe(item));
  db.prepare('UPDATE recipes SET minutes=77 WHERE title=?').run('Bœuf carottes du dimanche');
  const before = recipes(db), store = sqliteRecipes(db);
  assert.equal(await store.importCatalog(catalog.map(validateRecipe)), 58);
  const after = recipes(db);
  assert.equal(after.length, before.length + 58);
  for (const item of before) assert.deepEqual(after.find(saved => saved.id === item.id), item);
  assert.equal(await store.importCatalog(catalog.map(validateRecipe)), 0);
  assert.deepEqual(recipes(db), after);
});
