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

function pickerView(mode = 'recipe') {
  const view = visuals();
  const elements = { 'picker-search': { value: '' }, 'picker-category': { value: '' }, 'picker-recipes': { dataset: { mode }, innerHTML: '' } };
  view.document = { getElementById: id => elements[id], querySelector: () => true };
  view.MangerFoodNames = require('./public/food-names');
  view.dietLabels = { vegan: 'Végétal', omnivore: 'De tout' };
  for (const recipe of view.state.recipes) { recipe.ingredients = []; recipe.minutes ||= 20; }
  view.state.recipes[0].diet = 'omnivore';
  view.state.recipes[0].favorite = true;
  const choice = html.match(/^    function choice\([\s\S]*?(?=\n    function openAdd)/m)[0];
  const picker = html.match(/^    function renderPickerRecipes\([\s\S]*?(?=\n    function openEventSetup)/m)[0];
  new Script(choice + picker).runInNewContext(view);
  return { view, elements, markup: () => elements['picker-recipes'].innerHTML };
}

test('les sélecteurs de repas et invités montrent une photo prioritaire puis le même émoji que le catalogue', () => {
  for (const mode of ['recipe', 'guestrecipe']) {
    const { view, markup } = pickerView(mode);
    view.renderPickerRecipes();
    assert.match(markup(), /<img class="recipe-cover" src="\/api\/recipes\/1\/photo"/);
    assert.match(markup(), /🥗/);
    assert.doesNotMatch(markup(), /<svg/);
    assert.match(markup(), new RegExp(`data-${mode}="1"`));
    assert.match(markup(), /Plat photographié/);
  }
});

test('la recherche, les univers, les favoris et le résultat vide restent disponibles avec les vignettes', () => {
  const { view, elements, markup } = pickerView();
  elements['picker-category'].value = '__favorites'; view.renderPickerRecipes();
  assert.match(markup(), /Favori/); assert.doesNotMatch(markup(), /Plat sans photo/);
  elements['picker-category'].value = 'japon'; view.renderPickerRecipes();
  assert.match(markup(), /\/api\/recipes\/1\/photo/); assert.doesNotMatch(markup(), /Plat sans photo/);
  elements['picker-category'].value = ''; elements['picker-search'].value = 'sans photo'; view.renderPickerRecipes();
  assert.match(markup(), /🥗/); assert.doesNotMatch(markup(), /<img/);
  elements['picker-search'].value = 'introuvablexyz'; view.renderPickerRecipes();
  assert.match(markup(), /Aucun plat trouvé/);
});

test('les commandes de types de repas gardent leurs SVG, sans vignette de recette', () => {
  const { view } = pickerView();
  const markup = view.choice('people', 'Inviter du monde', 'À la maison', { occasion: 'guests' });
  assert.match(markup, /data-ui-name="people"/);
  assert.doesNotMatch(markup, /recipe-cover|<img/);
});
