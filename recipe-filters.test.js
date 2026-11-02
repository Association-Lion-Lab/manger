const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

test('les filtres sont disponibles dès l’ouverture et leur remise à zéro conserve l’univers', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  assert.doesNotMatch(html.match(/<label id="recipe-time-filter-field"[^>]*>/)[0], /hidden/);
  assert.match(html, /aria-label="Filtrer les recettes"/);
  assert.match(html, /id="reset-recipe-filters"[^>]*hidden/);
  const controls = {
    'recipe-search': { value: 'carottes' },
    'recipe-time-filter': { value: '30', focus() { this.focused = true; } },
    'recipe-season-filter': { 'aria-pressed': 'true', setAttribute(name, value) { this[name] = value; } }
  };
  let click, renders = 0;
  const source = html.match(/^    document.getElementById\('reset-recipe-filters'\)[\s\S]*?(?=\n    document.getElementById\('recipe-season-filter'\).addEventListener)/m)[0];
  const context = { activeRecipeCategory: 'japon', renderRecipes: () => renders++, document: { getElementById: id => id === 'reset-recipe-filters' ? { addEventListener: (_, listener) => click = listener } : controls[id] } };
  new Script(source).runInNewContext(context);
  click();
  assert.equal(controls['recipe-search'].value, '');
  assert.equal(controls['recipe-time-filter'].value, '');
  assert.equal(controls['recipe-season-filter']['aria-pressed'], 'false');
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
  assert.match(html, /recipeSeason\(recipe, month\)/);
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
    document: { getElementById: element },
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

test('le filtre national ne propose plus de région ni ne lit les anciens réglages régionaux', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  assert.doesNotMatch(html, /recipe-season-region|seasonRegion|manger-season-region-v1/);
  assert.match(html, /MangerSeasons.seasonCalendars.france/);
  assert.match(html, /aria-controls="recipes recipe-season-month-field recipe-season-note"/);
});

test('la même saison française rassemble les recettes de toutes régions malgré un ancien choix local', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.match(/^    function renderRecipes\(\) \{[\s\S]*?(?=\n    function refreshSeasonMonth)/m)[0];
  const recipes=[{id:1,title:'Gratin du Nord',ingredients:[{name:'endive'}]},
    {id:2,title:'Poireaux bretons',ingredients:[{name:'poireau'}]},
    {id:3,title:'Tian provençal',ingredients:[{name:'tomate'}]}]
    .map(r=>({...r,tags:['terroir'],minutes:25,diet:'vegetarian'}));
  for(const saved of ['bretagne','hauts-de-france','france','inconnue',null]){
    const controls={},element=id=>controls[id]||=( {value:'',getAttribute:()=> 'true'} );
    const context={activeRecipeCategory:'',renderedSeasonMonth:null,
      Date:class extends Date{constructor(){super(2026,9,12);}},Intl,document:{getElementById:element},
      seasonRegion:{value:saved},localStorage:{getItem(){throw Error('Aucune lecture régionale attendue');}},
      state:{recipes},recipeCategories:{terroir:'🥖 Terroir français'},dietLabels:{vegetarian:'Végétarien'},
      MangerSeasons:require('./public/seasons'),MangerFoodNames:require('./public/food-names'),
      escapeHtml:value=>value,recipeCover:()=>'',recipeFavoriteButton:()=>'',uiIcon:require('./public/ui-icons').icon};
    new Script(source).runInNewContext(context);context.renderRecipes();
    assert.match(element('recipes').innerHTML,/Gratin du Nord/);
    assert.match(element('recipes').innerHTML,/Poireaux bretons/);
    assert.doesNotMatch(element('recipes').innerHTML,/Tian provençal/);
    assert.equal(element('recipe-results-title').textContent,'En octobre');
  }
});
