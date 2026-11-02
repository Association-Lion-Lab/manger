const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const catalog = require('./catalog');
const { recipeSeason } = require('./public/seasons');
const { createApp, createDatabase, recipes, saveRecipe, validateRecipe } = require('./server');

const seasons = [
  { name: 'hiver', month: 1, opposite: 8, titles: [
    'Soupe de chou et haricots blancs', 'Velouté de panais et carottes au cumin',
    'Soupe de céleri, pomme et lentilles corail', 'Lentilles mijotées au chou et aux carottes',
    'Épaule de porc mijotée aux poireaux et pommes de terre',
  ] },
  { name: 'printemps', month: 5, opposite: 8, titles: [
    'Soupe de petits pois et pomme de terre à la menthe', 'Velouté d’épinards et lentilles corail',
    'Soupe de navets et carottes au cumin', 'Pois chiches mijotés aux navets et petits pois',
    'Poulet mijoté aux petits pois et carottes',
  ] },
  { name: 'été', month: 8, opposite: 1, titles: [
    'Velouté de courgettes au basilic', 'Soupe de tomates fraîches au riz',
    'Soupe d’aubergine, tomate et pois chiches', 'Haricots blancs mijotés aux aubergines',
    'Poulet mijoté aux courgettes et poivrons',
  ] },
  { name: 'automne', month: 10, opposite: 5, titles: [
    'Velouté de brocoli et pommes de terre', 'Soupe de chou-fleur et pois chiches au curry',
    'Velouté de potimarron et lentilles corail', 'Lentilles mijotées à la courge et aux champignons',
    'Épaule de porc mijotée au chou-fleur et aux carottes',
  ] },
];

for (const season of seasons) {
  test(`soupes et mijotés (${season.name}) : légumes reconnus et filtrés selon le mois`, () => {
    for (const title of season.titles) {
      const item = catalog.find(recipe => recipe.title === title);
      assert.ok(item, title);
      assert.equal(recipeSeason(item, season.month).matches, true, title);
      assert.equal(recipeSeason(item, season.opposite).matches, false, title);
    }
  });
}

test('lot économique : 12 soupes végétales, 8 mijotés et aucun prix ou avis inventé', () => {
  const additions = catalog.slice(100);
  assert.equal(additions.length, 20);
  const soups = additions.filter(item => /^(Soupe|Velouté)/u.test(item.title));
  assert.equal(soups.length, 12);
  assert.ok(soups.every(item => item.diet === 'vegan' && item.tags.includes('rat')));
  assert.equal(additions.filter(item => item.tags.includes('mijote')).length, 8);
  for (const item of additions) {
    assert.equal(Object.hasOwn(item, 'price'), false, item.title);
    assert.equal(Object.hasOwn(item, 'rating'), false, item.title);
    if (item.title.includes('Poulet')) assert.ok(item.steps.some(step => step.instruction.includes('74 °C')), item.title);
  }
});

test('import depuis 100 fiches : 20 ajouts, personnalisation conservée, répétition sans doublon', async t => {
  const db = createDatabase(':memory:'), server = createApp(db);
  t.after(() => { server.close(); db.close(); });
  for (const item of catalog.slice(0, 100)) saveRecipe(db, validateRecipe(item));
  db.prepare('UPDATE recipes SET minutes=77 WHERE title=?').run(catalog[0].title);
  const before = recipes(db);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/catalog/import`;
  const response = await fetch(url, { method: 'POST' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { added: 20 });
  const after = recipes(db);
  assert.equal(after.length, before.length + 20);
  for (const item of before) assert.deepEqual(after.find(saved => saved.id === item.id), item);
  for (const item of catalog.slice(100)) {
    const saved = after.find(recipe => recipe.title === item.title);
    assert.ok(saved, item.title);
    assert.equal(saved.ingredients.length, item.ingredients.length, item.title);
    for (const part of item.ingredients) {
      assert.deepEqual({ ...saved.ingredients.find(ingredient => ingredient.name === part.name) }, part, item.title);
    }
  }
  assert.deepEqual(await (await fetch(url, { method: 'POST' })).json(), { added: 0 });
  assert.deepEqual(recipes(db), after);
});
