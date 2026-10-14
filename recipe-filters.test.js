const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

test('les filtres sont disponibles dès l’ouverture, leur remise à zéro reste locale et conserve l’univers et le calendrier', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  assert.doesNotMatch(html.match(/<label id="recipe-time-filter-field"[^>]*>/)[0], /hidden/);
  assert.match(html, /aria-label="Filtrer les recettes"/);
  assert.match(html, /id="reset-recipe-filters"[^>]*hidden/);
  const controls = {
    'recipe-search': { value: 'carottes' },
    'recipe-time-filter': { value: '30', focus() { this.focused = true; } },
    'recipe-season-filter': { 'aria-pressed': 'true', setAttribute(name, value) { this[name] = value; } },
    'recipe-season-region': { value: 'bretagne' }
  };
  let click, renders = 0;
  const source = html.match(/^    document.getElementById\('reset-recipe-filters'\)[\s\S]*?(?=\n    seasonRegion.addEventListener)/m)[0];
  const context = { activeRecipeCategory: 'japon', renderRecipes: () => renders++, document: { getElementById: id => id === 'reset-recipe-filters' ? { addEventListener: (_, listener) => click = listener } : controls[id] } };
  new Script(source).runInNewContext(context);
  click();
  assert.equal(controls['recipe-search'].value, '');
  assert.equal(controls['recipe-time-filter'].value, '');
  assert.equal(controls['recipe-season-filter']['aria-pressed'], 'false');
  assert.equal(controls['recipe-season-region'].value, 'bretagne');
  assert.equal(context.activeRecipeCategory, 'japon');
  assert.equal(renders, 1);
  assert.equal(controls['recipe-time-filter'].focused, true);
  context.activeRecipeCategory = '__favorites';
  controls['recipe-search'].value = 'introuvable';
  controls['recipe-time-filter'].value = '45';
  click();
  assert.equal(context.activeRecipeCategory, '__favorites');
  assert.equal(controls['recipe-search'].value, '');
  assert.equal(controls['recipe-time-filter'].value, '');
  assert.equal(renders, 2);
});

test('la saison suit le mois système local et se réactualise uniquement si nécessaire', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  assert.doesNotMatch(html, /id="recipe-season-month"|new Date\(2026, index/);
  assert.match(html, /const today = new Date\(\);\s+const month = today.getMonth\(\) \+ 1/);
  assert.match(html, /recipeSeason\(recipe, month, seasonRegion.value\)/);
  assert.match(html, /document.addEventListener\('visibilitychange', refreshSeasonMonth\)/);
  assert.match(html, /window.addEventListener\('focus', refreshSeasonMonth\)/);
  assert.match(html, /setInterval\(refreshSeasonMonth, 60000\)/);
  assert.match(html, /button.dataset.panel === 'recipes'\) refreshSeasonMonth\(\)/);
  const source = html.match(/^    function refreshSeasonMonth\(\) \{[\s\S]*?^    \}/m)[0];
  let month = 10, renders = 0;
  const panel = { hidden: false };
  const context = { renderedSeasonMonth: 10, Date: class { getMonth() { return month - 1; } }, document: { hidden: false, getElementById: () => panel }, renderRecipes() { renders++; context.renderedSeasonMonth = month; } };
  new Script(source).runInNewContext(context);
  context.refreshSeasonMonth();
  assert.equal(renders, 0);
  month = 11; context.document.hidden = true; context.refreshSeasonMonth();
  assert.equal(renders, 0);
  context.document.hidden = false; panel.hidden = true; context.refreshSeasonMonth();
  assert.equal(renders, 0);
  panel.hidden = false; context.refreshSeasonMonth();
  assert.equal(renders, 1);
  context.refreshSeasonMonth();
  assert.equal(renders, 1);
  month = 1; context.refreshSeasonMonth();
  assert.equal(renders, 2);
});

test('le compteur saisonnier suit les résultats et reste discret hors filtre', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  assert.match(html, /id="recipe-season-month-field" role="status" aria-atomic="true" hidden/);
  const source = html.match(/^    function renderRecipes\(\) \{[\s\S]*?(?=\n    function refreshSeasonMonth)/m)[0];
  const controls = {};
  const element = id => controls[id] ||= { value: '', getAttribute: () => 'true' };
  const context = {
    activeRecipeCategory: 'japon', renderedSeasonMonth: null,
    Date: class extends Date { constructor() { super(2026, 9, 12); } }, Intl,
    document: { getElementById: element }, seasonRegion: { value: 'france' },
    MangerSeasons: require('./public/seasons'), MangerFoodNames: require('./public/food-names'),
    state: { recipes: [] }, recipeCategories: { japon: '🇯🇵 Japon' }, dietLabels: { vegetarian: 'Végétarien' },
    escapeHtml: value => value, recipeCover: () => '', recipeFavoriteButton: () => '', uiIcon: require('./public/ui-icons').icon,
  };
  new Script(source).runInNewContext(context);
  for (const count of [0, 1, 2]) {
    context.state.recipes = Array.from({ length: count }, (_, id) => ({
      id, title: 'Poireaux', ingredients: [{ name: 'poireau' }], tags: ['japon'], minutes: 20, diet: 'vegetarian',
    }));
    context.renderRecipes();
    assert.equal(element('recipe-season-month-field').textContent, `En ce moment · octobre · ${count} recette${count > 1 ? 's' : ''} de saison`);
    assert.equal(element('recipe-season-month-field').hidden, false);
  }
  element('recipe-season-filter').getAttribute = () => 'false';
  context.renderRecipes();
  assert.equal(element('recipe-season-month-field').hidden, true);
});

test('le calendrier mémorisé est validé et un stockage indisponible ne bloque pas les recettes', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.match(/^    const seasonRegion = [\s\S]*?(?=\n    let editingRecipeId)/m)[0];
  for (const saved of ['bretagne', 'hauts-de-france', 'france', '__proto__', 'inconnue', null]) {
    const select = { value: 'france' };
    new Script(source).runInNewContext({ document: { getElementById: () => select }, MangerSeasons: require('./public/seasons.js'), localStorage: { getItem: () => saved } });
    assert.equal(select.value, ['bretagne', 'hauts-de-france'].includes(saved) ? saved : 'france');
  }
  const select = { value: 'france' };
  new Script(source).runInNewContext({ document: { getElementById: () => select }, MangerSeasons: require('./public/seasons.js'), localStorage: { getItem() { throw new Error('Stockage interdit'); } } });
  assert.equal(select.value, 'france');
  assert.match(html, /id="recipe-season-region-field" hidden/);
  assert.match(html, /id="recipe-season-region" aria-label="Calendrier des recettes de saison"/);
});

test('changer de calendrier continue de filtrer même si sa mémorisation est refusée', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.match(/^    seasonRegion.addEventListener\('change',[\s\S]*?(?=\n    document.getElementById\('recipe-season-filter'\))/m)[0];
  for (const denied of [false, true]) {
    let change, renders = 0;
    const writes = [];
    new Script(source).runInNewContext({
      seasonRegion: { value: 'bretagne', addEventListener: (_, handler) => change = handler },
      renderRecipes: () => renders++,
      localStorage: { setItem(key, value) { if (denied) throw new Error('Stockage interdit'); writes.push([key, value]); } },
    });
    change();
    assert.equal(renders, 1);
    assert.deepEqual(writes, denied ? [] : [['manger-season-region-v1', 'bretagne']]);
  }
});
