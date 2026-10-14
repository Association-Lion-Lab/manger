const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

function visuals() {
  const context = {
    state: { recipes: [{ id: 1, title: 'Plat photographié', tags: ['japon'], hasPhoto: true, minutes: 20 }, { id: 2, title: 'Plat sans photo', tags: [], diet: 'vegan', hasPhoto: false }], members: [{ id: 1, name: 'Personne A' }, { id: 2, name: 'Personne B' }], proteins: [] },
    escapeHtml: String, uiIcon: require('./public/ui-icons').icon,
  };
  const meal = html.match(/^    function mealMarkup\([\s\S]*?(?=\n    function renderSchedule)/m)[0];
  const covers = html.match(/^    function recipeIcon\([\s\S]*?(?=\n    function recipeFavoriteButton)/m)[0];
  new Script(meal + covers).runInNewContext(context);
  return context;
}

test('une carte de recette utilise sa photo avant toute illustration', () => {
  const view = visuals();
  assert.match(view.recipeCover(view.state.recipes[0]), /^<img.*src="\/api\/recipes\/1\/photo"/);
  assert.doesNotMatch(view.recipeCover(view.state.recipes[0]), /🍜|<svg/);
  assert.match(view.recipeCover(view.state.recipes[1]), /🥗/);
});

test('la photo du plat prime aussi pour dates, invités et restes dans le calendrier', () => {
  const view = visuals();
  for (const occasion of ['regular', 'date', 'guests']) for (const leftoverOf of [null, 42]) {
    const markup = view.mealMarkup('soir', { title: 'Repas nommé', recipeId: 1, location: 'home', occasion, people: 2, minutes: 20, extraPortions: 2, leftoverOf });
    assert.match(markup, /<img src="\/api\/recipes\/1\/photo"/);
    assert.doesNotMatch(markup, /class="meal-icon"/);
    assert.match(markup, /Repas nommé/);
    assert.match(markup, /4 portions à cuisiner/);
    if (leftoverOf) assert.match(markup, /Restes/);
  }
});

test('les assiettes séparées donnent priorité à chaque photo, sans masquer le plat sans photo', () => {
  const view = visuals();
  const markup = view.mealMarkup('midi', { title: 'Deux plats', dishes: [{ memberId: 1, recipeId: 1, portions: 1 }, { memberId: 2, recipeId: 2, portions: 1 }], location: 'home', occasion: 'regular', people: 2 });
  assert.match(markup, /<img class="recipe-cover" src="\/api\/recipes\/1\/photo"/);
  assert.match(markup, /🥗/);
  assert.match(markup, /Personne A/); assert.match(markup, /Personne B/);
});
