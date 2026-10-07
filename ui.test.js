const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const { createApp, createDatabase } = require('./server');

test('les quatre onglets ont un écran et les scripts intégrés restent valides', () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const navigation = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0] || '';
  const panels = [...navigation.matchAll(/data-panel="([a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(panels, ['week', 'recipes', 'shopping', 'account']);
  for (const panel of panels) assert.match(html, new RegExp(`<section id="${panel}-panel"`));
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new Script(match[1]);
});

test('le bouton Exporter demande le fichier ICS de la semaine affichée sans ouverture directe du calendrier', () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.split('\n').find(line => line.includes("document.getElementById('export-calendar').addEventListener"));
  let click;
  const location = {};
  const weekStart = new Date('2026-10-05T12:00:00');
  new Script(source).runInNewContext({ location, state: { weekStart }, key: date => {
    assert.equal(date, weekStart); return '2026-10-05';
  }, document: { getElementById: id => {
    assert.equal(id, 'export-calendar');
    return { addEventListener: (event, handler) => { assert.equal(event, 'click'); click = handler; } };
  } } });
  click();
  assert.equal(location.href, '/api/calendar.ics?start=2026-10-05&download=1');
});

test('le planning expose réutilisation et export sans Plus d’options, avec les deux parcours existants dans le même dialogue', () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const panel = html.match(/<section id="week-panel"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(panel, /<details|Plus d’options/);
  assert.match(panel, /id="reuse-week"[^>]*aria-haspopup="dialog">Réutiliser un menu/);
  assert.match(panel, /id="export-calendar"[^>]*aria-label="Exporter la semaine dans un calendrier"/);
  const source = html.match(/    function openReuseWeek[\s\S]*?(?=\n    document.getElementById\('reuse-week'\))/)[0];
  const controls = new Map(); let shown = 0, focused = 0;
  const dialog = { open: false, showModal() { this.open = true; shown++; } };
  const context = { dialog, document: { getElementById: id => { if (!controls.has(id)) controls.set(id, {}); return controls.get(id); }, querySelector: () => ({ focus() { focused++; } }) },
    choice: (_, title, detail, data) => `<button data-reuse="${data.reuse}">${title} ${detail}</button>` };
  const open = new Script(source + ';openReuseWeek').runInNewContext(context);
  open(); assert.equal(shown, 1); assert.equal(focused, 1);
  assert.match(controls.get('choices').innerHTML, /data-reuse="past"/);
  assert.match(controls.get('choices').innerHTML, /data-reuse="templates"/);
  assert.equal(controls.get('dialog-error').hidden, true);
  open(); assert.equal(shown, 1); assert.equal(focused, 2);
  assert.match(html, /button.dataset.reuse === 'past' \? openCopyWeek\(\) : openWeekTemplates\(\)/);
  assert.match(html, /if \(event.target.closest\('\[data-reuse-back\]'\)\) return openReuseWeek\(\)/);
  assert.match(html, /const templates = await api\('\/api\/week-templates'\);\s*if \(!list.isConnected\) return;/);
});

test('reprendre une occasion retrouve les champs sans contaminer un autre type ou une nouvelle recette', () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.match(/    function openEventSetup[\s\S]*?(?=\n    function findRestaurants)/)[0];
  const controls = new Map(); let current = null;
  const control = id => {
    if (!controls.has(id)) controls.set(id, { value: '', addEventListener(name, callback) { this[name] = callback; }, dispatchEvent(event) { this[event.type]?.(event); } });
    return controls.get(id);
  };
  const recipes = [{ id: 1, title: 'Curry', minutes: 30, tags: ['date'] }, { id: 2, title: 'Risotto', minutes: 40, tags: [] }];
  const context = { state: { selected: 0, slot: 'soir', recipes }, fullDayNames: ['Lundi'], Event,
    mealFor: () => current, document: { getElementById: control },
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') };
  const open = new Script(source + ';openEventSetup').runInNewContext(context);
  const show = (occasion, mode, recipe) => {
    controls.clear(); control('event-location').value = occasion === 'guests' ? 'home' : 'restaurant';
    open(occasion, mode, recipe); return control('choices').innerHTML;
  };
  assert.match(show('date'), /id="event-people"[^>]*value="2"/);
  assert.equal(control('event-location').value, 'restaurant'); assert.equal(control('date-home-recipes').hidden, true);
  current = { occasion: 'date', location: 'home', people: 3, recipeId: 1, title: 'Dîner "à deux" <3' };
  assert.match(show('date'), /value="Dîner &quot;à deux&quot; &lt;3"/);
  assert.match(control('choices').innerHTML, /id="event-people"[^>]*value="3"/);
  assert.match(control('choices').innerHTML, /Enregistrer les modifications/);
  assert.equal(control('date-recipe').value, 1); assert.equal(control('event-location').value, 'home');
  assert.equal(control('event-restaurant-search').hidden, true); assert.equal(control('date-home-recipes').hidden, false);
  control('date-recipe').change({ target: { value: '2' } }); assert.equal(control('event-title').value, 'Risotto');
  control('date-recipe').change({ target: { value: '' } }); assert.equal(control('event-title').value, 'Date à organiser');
  assert.match(show('regular'), /value="Repas à l’extérieur"/); assert.match(control('choices').innerHTML, /id="event-people"[^>]*value="1"/);
  current = { occasion: 'regular', location: 'outside', people: 5, recipeId: null, title: 'Pique-nique' };
  assert.match(show('regular'), /value="Pique-nique"/); assert.equal(control('event-location').value, 'outside');
  assert.equal(control('event-restaurant-search').hidden, true);
  current = { occasion: 'guests', location: 'home', people: 6, recipeId: 1, title: 'Curry pour les amis' };
  assert.match(show('guests', 'recipe', recipes[0]), /value="Curry pour les amis"/);
  assert.match(show('guests', 'recipe', recipes[1]), /value="Risotto"/);
  assert.equal(context.state.pendingEvent.recipeId, 2); assert.match(control('choices').innerHTML, /id="event-people"[^>]*value="6"/);
  assert.match(show('guests', 'free'), /value="Repas sans recette"/); assert.equal(context.state.pendingEvent.recipeId, null);
  current.recipeId = null; current.title = 'Sushi chez nous';
  assert.match(show('guests', 'order'), /value="Sushi chez nous"/);
  assert.match(show('guests', 'free'), /value="Sushi chez nous"/); // These two modes have the same stored shape.
  for (const special of [{ leftoverOf: 4 }, { assignments: [{}] }, { dishes: [{}] }]) {
    current = { occasion: 'date', location: 'home', people: 8, recipeId: 1, title: 'Ne pas reprendre', ...special };
    assert.match(show('date'), /value="Date à organiser"/); assert.match(control('choices').innerHTML, /id="event-people"[^>]*value="2"/);
  }
  current = { occasion: 'regular', location: 'home', people: 8, recipeId: 1, title: 'Repas maison' };
  assert.match(show('regular'), /value="Repas à l’extérieur"/);
});

test('un date repris garde sa recette à la maison mais la retire si le lieu devient extérieur', async () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.match(/    async function saveEvent[\s\S]*?(?=\n    async function postMeal)/)[0];
  const controls = new Map([['event-location', { value: 'home' }], ['date-recipe', { value: '2' }], ['event-people', { value: '3' }], ['event-title', { value: 'Dîner maison' }]]);
  const writes = [], context = { state: { pendingEvent: { occasion: 'date' }, slot: 'soir', selected: 0 },
    document: { getElementById: id => controls.get(id) }, dateAt: () => '2026-10-05', key: value => value, postMeal: async payload => writes.push(payload) };
  const save = new Script(source + ';saveEvent').runInNewContext(context);
  await save(); assert.equal(writes[0].recipeId, 2); assert.equal(writes[0].people, 3); assert.equal(writes[0].title, 'Dîner maison');
  controls.get('event-location').value = 'restaurant'; await save(); assert.equal(writes[1].recipeId, null);
  controls.get('event-location').value = 'home'; controls.get('date-recipe').value = ''; await save(); assert.equal(writes[2].recipeId, null);
  context.state.pendingEvent = { occasion: 'guests', recipeId: 1 }; await save(); assert.equal(writes[3].recipeId, 1);
});

test('les rayons automatiques reconnaissent les présentations et préservent les corrections sans modifier les articles', () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.match(/    function shoppingAisle[\s\S]*?(?=\n    function )/)[0];
  const aisle = new Script(source + ';shoppingAisle').runInNewContext({ MangerFoodNames: require('./public/food-names') });
  for (const [expected, names] of [
    ['Fruits et légumes', ['COncombres', 'ÉPINARDS', 'poireaux', 'pommes de terre', 'haricots verts', 'petits pois', 'patates douces', 'basilic']],
    ['Frais', ['œufs', 'OEUFS', 'BŒUF', 'boeuf', 'cabillaud', 'crevettes', 'jambon cuit', 'pâte brisée', 'crème liquide', 'tofu fumé']],
    ['Épicerie', ['tomates concassées', 'tomates en conserve', 'thon au naturel égoutté', 'crème de coco', 'beurre de cacahuète', 'nouilles udon sèches sans œuf', 'pâtes sèches sans œuf', 'pois chiches cuits égouttés', 'bouillon de légumes', 'Café', 'thé']],
    ['Surgelés', ['petits pois surgelés', 'épinards surgelés', 'crevettes congelées']],
    ['Maison', ['Savon', 'lessive', 'papier toilette']],
    ['Autres', ['produit inconnu', 'tapis', 'sellette', 'poivrière']]
  ]) for (const name of names) {
    const item = { name, amount: 2, unit: 'pièce', checked: false, aisle: '' }, before = { ...item };
    assert.equal(aisle(item), expected, name);
    assert.deepEqual(item, before);
    assert.equal(aisle({ ...item, aisle: 'Autres' }), 'Autres');
    assert.equal(aisle({ ...item, aisle: 'Maison' }), 'Maison');
  }
  assert.match(html, /id="manual-aisle"><option value="">Automatique<\/option>/);
  assert.doesNotMatch(html, /shoppingMove\.manualId \? \[\] : \[''\]/);
  assert.match(html, /\.shopping-list\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(html, /\.shopping-item span\s*\{\s*min-width:\s*0;\s*overflow-wrap:\s*anywhere;/);
});

test('modifier les courses bloque les doubles envois, conserve la saisie en échec et ne rejoue pas une écriture confirmée', async () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.match(/    async function saveShoppingEdit[\s\S]*?(?=\n    document.getElementById\('shopping-edit-form'\))/)[0];
  const controls = new Map([
    ['shopping-edit-form', { reportValidity: () => true }], ['shopping-edit-fields', {}], ['close-shopping-move', {}], ['shopping-edit-error', {}],
    ['shopping-edit-name', { value: 'Bananes' }], ['shopping-edit-amount', { value: '4' }], ['shopping-edit-unit', { value: 'pièce' }], ['shopping-move-aisle', { value: '' }], ['organize-shopping', { focus() {} }], ['shopping-error', {}]
  ]);
  const writes = [], errors = []; let release, failure, readFails = false, closed = 0;
  const context = {
    shoppingEditBusy: false, shoppingMove: { manualId: 7, name: 'Pommes', amount: 2, unit: 'kg', aisle: '' }, shoppingMoveWeek: '2026-09-14',
    document: { getElementById: id => controls.get(id), querySelector: () => null },
    shoppingMoveDialog: { close() { closed++; } }, AbortSignal, Error, confirm: () => true,
    shoppingError: error => errors.push(error.message), load: async () => { if (readFails) throw new Error('Lecture échouée'); },
    api: async (path, options) => { writes.push({ path, options }); await new Promise(resolve => { release = resolve; }); if (failure) throw new Error(failure); }
  };
  const save = new Script(source + ';saveShoppingEdit').runInNewContext(context);
  const first = save(); await save();
  assert.equal(writes.length, 1); assert.equal(context.shoppingEditBusy, true);
  assert.equal(controls.get('shopping-edit-fields').disabled, true);
  assert.equal(controls.get('close-shopping-move').disabled, true);
  assert.equal(writes[0].path, '/api/shopping-manual/7'); assert.equal(writes[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(writes[0].options.body), { weekStart: '2026-09-14', name: 'Bananes', unit: 'pièce', manualId: 7, aisle: '', amount: 4, previous: context.shoppingMove });
  failure = 'Connexion coupée'; release(); await first;
  assert.equal(closed, 0); assert.equal(controls.get('shopping-edit-name').value, 'Bananes');
  assert.equal(controls.get('shopping-edit-error').textContent, failure);
  assert.equal(context.shoppingEditBusy, false); assert.equal(controls.get('shopping-edit-fields').disabled, false);
  failure = null; readFails = true;
  const retry = save(); release(); await retry;
  assert.equal(closed, 1); assert.equal(writes.length, 2); assert.match(errors[0], /enregistrée/);
  assert.equal(context.shoppingEditBusy, false);
  readFails = false; context.shoppingMove = { name: 'Riz', amount: 200, unit: 'g' };
  const move = save(); release(); await move;
  assert.equal(writes[2].path, '/api/shopping-aisles'); assert.equal(writes[2].options.method, 'POST');
  assert.equal(JSON.parse(writes[2].options.body).amount, undefined);
  await save(true); assert.equal(writes.length, 3);
  assert.match(html, /shoppingMoveDialog.addEventListener\('cancel', event => \{ if \(shoppingEditBusy\) event.preventDefault\(\)/);
  assert.doesNotMatch(html, /data-remove-shopping/);
});

test('ajouter un article bloque les doubles envois et les champs, garde le brouillon et distingue écriture et lecture échouées', async () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.match(/    async function addManualShopping[\s\S]*?(?=\n    document.getElementById\('manual-shopping-form'\))/)[0];
  const controls = new Map([['manual-shopping-fields', {}], ['shopping-error', {}], ['manual-name', { value: 'Café' }], ['manual-amount', { value: '2' }], ['manual-unit', { value: 'paquet' }], ['manual-aisle', { value: 'Épicerie' }]]);
  const button = {}; let valid = true, resets = 0, busy, release, failure = null, readFails = false;
  const form = { reportValidity: () => valid, querySelector: () => button, setAttribute: (_, value) => { busy = value; }, reset() { resets++; controls.get('manual-name').value = ''; } };
  const writes = [], errors = [];
  const context = {
    manualShoppingBusy: false, AbortSignal, Error, state: { weekStart: '2026-09-28' }, key: value => value,
    document: { getElementById: id => controls.get(id) }, shoppingError: error => errors.push(error.message),
    api: async (path, options) => { writes.push({ path, options }); await new Promise(resolve => { release = resolve; }); if (failure) throw failure; },
    load: async () => { if (readFails) throw new Error('Lecture échouée'); }
  };
  const add = new Script(source + ';addManualShopping').runInNewContext(context);
  const event = { preventDefault() {}, currentTarget: form };
  valid = false; await add(event); assert.equal(writes.length, 0); valid = true;
  const first = add(event); await add(event);
  assert.equal(writes.length, 1); assert.equal(context.manualShoppingBusy, true);
  assert.equal(controls.get('manual-shopping-fields').disabled, true); assert.equal(busy, 'true');
  assert.equal(writes[0].path, '/api/shopping-manual'); assert.equal(writes[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(writes[0].options.body), { weekStart: '2026-09-28', name: 'Café', amount: 2, unit: 'paquet', aisle: 'Épicerie' });
  failure = new TypeError('fetch failed'); release(); await first;
  assert.equal(resets, 0); assert.equal(controls.get('manual-name').value, 'Café');
  assert.match(errors[0], /peut-être reçu/); assert.equal(controls.get('manual-shopping-fields').disabled, false);
  assert.equal(context.manualShoppingBusy, false); assert.equal(busy, 'false');
  assert.equal(button.textContent, 'Ajouter aux courses');
  failure = null; readFails = true;
  const retry = add(event); release(); await retry;
  assert.equal(writes.length, 2); assert.equal(resets, 1); assert.equal(controls.get('manual-name').value, '');
  assert.match(errors[1], /a été ajouté/); assert.match(errors[1], /Réessayer/);
  assert.equal(context.manualShoppingBusy, false);
  readFails = false;
  for (const name of ['TimeoutError', 'SyntaxError']) {
    failure = { name, message: 'Réponse indisponible' };
    controls.get('manual-name').value = 'Savon';
    const uncertain = add(event); release(); await uncertain;
    assert.match(errors.at(-1), /peut-être reçu/);
    assert.equal(controls.get('manual-name').value, 'Savon');
    assert.equal(resets, 1);
  }
});

test('le placard protège ajout, édition et retrait, conserve les échecs et ne rejoue pas un stock confirmé', async () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.match(/    async function savePantry[\s\S]*?(?=\n    document.getElementById\('pantry-form'\))/)[0];
  const button = { textContent: 'Enregistrer le stock' }, summary = { focus() { this.focused = true; } };
  const controls = new Map([
    ['pantry-form', { reportValidity: () => valid, setAttribute(_, value) { this.busy = value; }, querySelector: () => button }],
    ['pantry-fields', {}], ['pantry-list', {}], ['close-pantry', {}], ['pantry-editor', { open: true }], ['pantry-error', {}],
    ['pantry-name', { value: 'Carottes' }], ['pantry-amount', { value: '500' }], ['pantry-unit', { value: 'g' }], ['pantry-use-by', { value: '2026-10-10' }],
    ['delete-pantry-item', { textContent: 'Retirer du placard' }]
  ]);
  const writes = [], errors = [], rendered = []; let valid = true, confirmed = true, release, failure, readFails = false, resets = 0;
  const context = {
    pantryBusy: false, pantryEditingId: null, pantryLoadVersion: 0, AbortSignal, Error,
    document: { getElementById: id => controls.get(id), querySelector: () => summary }, confirm: () => confirmed,
    pantryError: error => errors.push(error.message), renderPantry: items => rendered.push(items),
    resetPantryEditor() { resets++; context.pantryEditingId = null; controls.get('pantry-name').value = ''; },
    load: async () => { if (readFails) throw new Error('Lecture échouée'); },
    api: async (path, options) => {
      writes.push({ path, options }); await new Promise(resolve => { release = resolve; });
      if (failure) throw failure; return [{ id: 7, name: 'Carottes', amount: 500 }];
    }
  };
  const save = new Script(source + ';savePantry').runInNewContext(context);
  valid = false; await save(); assert.equal(writes.length, 0);
  valid = true;
  const pending = save(); await save(); await save(true);
  assert.equal(writes.length, 1); assert.equal(context.pantryBusy, true);
  assert.equal(controls.get('pantry-fields').disabled, true);
  assert.equal(controls.get('pantry-list').inert, true);
  assert.equal(controls.get('close-pantry').disabled, true);
  assert.equal(controls.get('pantry-form').busy, 'true'); assert.equal(button.textContent, 'Enregistrement…');
  assert.deepEqual(JSON.parse(writes[0].options.body), { newLot: true, name: 'Carottes', unit: 'g', amount: 500, useBy: '2026-10-10' });
  assert.ok(writes[0].options.signal instanceof AbortSignal);
  failure = new Error('Stock refusé'); release(); await pending;
  assert.equal(resets, 0); assert.equal(controls.get('pantry-name').value, 'Carottes'); assert.equal(errors.at(-1), 'Stock refusé');
  assert.equal(context.pantryBusy, false); assert.equal(controls.get('pantry-fields').disabled, false);
  assert.equal(controls.get('pantry-list').inert, false); assert.equal(controls.get('close-pantry').disabled, false);
  assert.equal(controls.get('pantry-form').busy, 'false'); assert.equal(button.textContent, 'Enregistrer le stock');
  for (const name of ['TimeoutError', 'TypeError', 'SyntaxError']) {
    failure = { name, message: 'Réponse perdue' }; const uncertain = save(); release(); await uncertain;
    assert.match(errors.at(-1), /peut-être reçu/); assert.equal(resets, 0); assert.equal(controls.get('pantry-name').value, 'Carottes');
  }
  failure = null; context.pantryEditingId = 7; readFails = true;
  const update = save(); release(); await update;
  assert.equal(JSON.parse(writes.at(-1).options.body).id, 7);
  assert.equal('newLot' in JSON.parse(writes.at(-1).options.body), false);
  assert.equal(resets, 1); assert.equal(controls.get('pantry-editor').open, false); assert.equal(summary.focused, true);
  assert.match(errors.at(-1), /placard est à jour/); assert.match(errors.at(-1), /Réessayer/); assert.equal(rendered.length, 1);
  context.pantryEditingId = 7; readFails = false; confirmed = false;
  const before = writes.length; await save(true); assert.equal(writes.length, before);
  confirmed = true; valid = false;
  const remove = save(true); await save(); await save(true);
  assert.equal(writes.length, before + 1); assert.equal(writes.at(-1).path, '/api/pantry/7');
  assert.equal(writes.at(-1).options.method, 'DELETE'); assert.equal(writes.at(-1).options.body, undefined);
  release(); await remove; assert.equal(resets, 2); assert.equal(controls.get('delete-pantry-item').textContent, 'Retirer du placard');
  assert.equal(context.pantryBusy, false);
  assert.match(html, /pantryDialog.addEventListener\('cancel', event => \{ if \(pantryBusy\) event.preventDefault\(\)/);
});

test('les lectures tardives du placard ne remplacent pas une nouvelle ouverture ou une écriture', async () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.match(/    async function loadPantry[\s\S]*?(?=\n    function pantryError)/)[0];
  const pending = [], rendered = [];
  const context = { pantryLoadVersion: 0, pantryDialog: { open: true }, AbortSignal,
    api: () => new Promise((resolve, reject) => pending.push({ resolve, reject })), renderPantry: items => rendered.push(items) };
  const load = new Script(source + ';loadPantry').runInNewContext(context);
  const old = load(), recent = load(); pending[1].resolve(['Récent']); await recent;
  pending[0].resolve(['Ancien']); await old; assert.deepEqual(rendered, [['Récent']]);
  const beforeWrite = load(); context.pantryLoadVersion++; pending[2].reject(new Error('Ancienne lecture')); await beforeWrite;
  const closed = load(); context.pantryDialog.open = false; pending[3].resolve(['Fermé']); await closed;
  assert.equal(rendered.length, 1);
  context.pantryDialog.open = true; const failed = load(); pending[4].reject(new Error('Lecture échouée'));
  await assert.rejects(failed, /Lecture échouée/);
});

test('les dates restent natives et leur largeur est étirée sans pourcentage pour éviter le padding additionnel sur iOS', () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const rule = html.match(/\.field input\[type="date"\]\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(rule, /\bwidth:\s*auto\s*;/);
  assert.match(rule, /\bjustify-self:\s*stretch\s*;/);
  assert.match(rule, /\bmax-width:\s*100%\s*;/);
  assert.match(html, /id="plan-recipe-date" type="date"/);
  assert.match(html, /id="week-date" type="date"/);
});

test('le logo est servi comme icône de page et d’écran d’accueil iPhone', async t => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png" sizes="180x180"/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Manger!"/);
  const db = createDatabase(':memory:');
  const server = createApp(db); server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/apple-touch-icon.png`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^image\/png/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(join(__dirname, 'public', 'icon-180.png')));
});

test('le partage des courses respecte l’annulation et exporte seulement les articles restants, avec copie ou fichier de secours', async () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.match(/    async function shareShopping[\s\S]*?(?=\n    document.getElementById\('share'\))/)[0];
  const state = { weekStart: '2026-09-28', shopping: [{ name: 'Café', checked: false }, { name: 'Savon', checked: true }] };
  const status = {}, button = { disabled: false }, navigator = {};
  const copies = [], downloads = [], revoked = []; let blob, failDownload = false;
  const share = new Script(source + ';shareShopping').runInNewContext({
    state, navigator, Blob, key: value => value, shoppingText: item => item.name,
    document: { getElementById: () => status, body: { append() {} }, createElement: () => ({
      click() { if (failDownload) throw new Error('Bloqué'); downloads.push(this.download); }, remove() {}
    }) },
    URL: { createObjectURL: value => { blob = value; return 'blob:test'; }, revokeObjectURL: value => revoked.push(value) },
    setTimeout: callback => callback()
  });
  const click = () => share({ currentTarget: button });
  navigator.clipboard = { writeText: async text => copies.push(text) };
  let payload;
  navigator.share = async data => { payload = data; };
  await click(); assert.equal(payload.text, '- Café'); assert.equal(copies.length, 0); assert.equal(status.hidden, true);
  navigator.share = async () => { throw { name: 'AbortError' }; };
  await click(); assert.equal(copies.length, 0); assert.equal(downloads.length, 0); assert.equal(status.hidden, true);
  navigator.share = async () => { throw { name: 'NotAllowedError' }; };
  await click(); assert.deepEqual(copies, ['- Café']); assert.match(status.textContent, /Liste copiée/);
  navigator.share = undefined;
  await click(); assert.equal(copies.length, 2); assert.equal(downloads.length, 0);
  navigator.clipboard.writeText = async () => { throw { name: 'NotAllowedError' }; };
  await click(); assert.deepEqual(downloads, ['manger-courses-2026-09-28.txt']);
  assert.equal(await blob.text(), '- Café\n'); assert.equal(blob.type, 'text/plain;charset=utf-8'); assert.deepEqual(revoked, ['blob:test']);
  navigator.clipboard = undefined;
  await click(); assert.equal(downloads.length, 2);
  failDownload = true;
  await click(); assert.match(status.textContent, /Impossible de partager/); assert.equal(status.className, 'error'); assert.equal(button.disabled, false); assert.equal(revoked.length, 3);
  let finish, calls = 0;
  navigator.share = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const pending = click(); assert.equal(button.disabled, true);
  await click(); assert.equal(calls, 1);
  finish(); await pending; assert.equal(button.disabled, false); assert.equal(status.hidden, true);
  state.shopping[0].checked = true;
  await click(); assert.match(status.textContent, /Aucun article/); assert.equal(calls, 1);
  state.shopping = [];
  await click(); assert.equal(downloads.length, 2); assert.equal(copies.length, 2);
});

test('les invitations se partagent volontairement, sans courriel automatique ni double action, et conservent une copie de secours', async () => {
  const html = readFileSync(join(__dirname, 'public', 'accounts.html'), 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new Script(match[1]);
  const source = html.match(/let invitationBusy[\s\S]*?(?=\nform\('password-form')/)[0];
  const nodes = new Map();
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false, hidden: true, textContent: '', focus() { this.focused = true; }, select() { this.selected = true; } });
    return nodes.get(id);
  };
  const location = { origin: 'https://192.168.1.31:3000', href: '/account' }, navigator = {};
  const calls = [], copies = []; let token = 'a'.repeat(64), fail = false, finish;
  const state = new Script(source + ';({expire(){invitationExpires=0;}})').runInNewContext({ $, location, navigator, Date, encodeURIComponent,
    api: async (path, method) => {
      calls.push({ path, method });
      if (fail) throw new Error('Serveur indisponible. Réessaie.');
      if (finish === null) await new Promise(resolve => { finish = resolve; });
      return { token, expires: Date.now() + 86400000 };
    }
  });
  assert.equal($('share-invitation').hidden, true); // Native sharing absent: copy and mail remain usable.
  await $('email-invitation').onclick();
  assert.match($('invitation-status').textContent, /Crée un lien/); assert.equal(location.href, '/account');
  await $('create-invitation').onclick();
  const link = location.origin + '/login#invite=' + token;
  assert.equal($('invitation-link').value, link); assert.equal($('invitation-result').hidden, false);
  navigator.clipboard = { writeText: async value => { copies.push(value); } };
  await $('copy-invitation').onclick(); assert.deepEqual(copies, [link]);
  let payload;
  navigator.share = async data => { payload = data; };
  await $('share-invitation').onclick();
  assert.equal(payload.url, link); assert.match(payload.text, /une seule inscription/);
  assert.match(payload.text, /Wi-Fi ou VPN/); assert.match($('invitation-status').textContent, /Vérifie son envoi/);
  navigator.share = async () => { throw { name: 'AbortError' }; };
  await $('share-invitation').onclick();
  assert.match($('invitation-status').textContent, /Partage annulé/); assert.equal(copies.length, 1); assert.equal(location.href, '/account');
  navigator.share = async () => { throw { name: 'NotAllowedError' }; };
  await $('share-invitation').onclick(); assert.match($('invitation-status').textContent, /Partage indisponible/);
  navigator.clipboard = undefined;
  await $('copy-invitation').onclick(); assert.equal($('invitation-link').selected, true); assert.match($('invitation-status').textContent, /menu du champ/);
  await $('email-invitation').onclick();
  const mail = new URL(location.href);
  assert.equal(mail.protocol, 'mailto:'); assert.equal(mail.pathname, ''); assert.equal(mail.hash, '');
  assert.equal(mail.searchParams.get('subject'), 'Invitation au foyer — Manger!');
  assert.ok(mail.searchParams.get('body').endsWith(link)); assert.match(mail.searchParams.get('body'), /recettes, au planning et aux courses partagés/);
  assert.equal(calls.length, 1); // Preparing a mail or sharing does not issue or consume another invitation.
  let shared = 0, resolveShare;
  navigator.share = () => { shared++; return new Promise(resolve => { resolveShare = resolve; }); };
  const sharing = $('share-invitation').onclick();
  for (const id of ['create-invitation','revoke-invitation','share-invitation','copy-invitation','email-invitation']) assert.equal($(id).disabled, true);
  await $('share-invitation').onclick(); await $('create-invitation').onclick(); await $('revoke-invitation').onclick();
  assert.equal(shared, 1); assert.equal(calls.length, 1);
  resolveShare(); await sharing; assert.equal($('create-invitation').disabled, false);
  state.expire(); const before = location.href;
  for (const id of ['share-invitation','copy-invitation','email-invitation']) { await $(id).onclick(); assert.match($('invitation-status').textContent, /a expiré/); }
  assert.equal(shared, 1); assert.equal(location.href, before);
  finish = null; token = 'b'.repeat(64);
  const creating = $('create-invitation').onclick();
  await $('create-invitation').onclick(); assert.equal(calls.length, 2);
  finish(); await creating; assert.ok($('invitation-link').value.endsWith(token));
  await $('revoke-invitation').onclick(); assert.equal($('invitation-result').hidden, true); assert.equal($('invitation-link').value, '');
  assert.equal(calls[2].method, 'DELETE');
  fail = true; await $('create-invitation').onclick(); assert.match($('invitation-status').textContent, /Serveur indisponible/);
  assert.equal($('create-invitation').disabled, false); assert.equal($('invitation-result').hidden, true);
});

test('le courriel serveur est volontaire, conserve le destinataire en erreur et protège les doubles envois', async () => {
  const html = readFileSync(join(__dirname, 'public', 'accounts.html'), 'utf8');
  assert.match(html, /id="server-email" hidden/);
  assert.match(html, /\$\('server-email'\)\.hidden=!\(me.admin&&me.invitationEmailEnabled\)/);
  const source = html.match(/let invitationBusy[\s\S]*?(?=\nform\('password-form')/)[0];
  const nodes = new Map(), calls = [];
  const $ = id => { if (!nodes.has(id)) nodes.set(id, { value: '', hidden: true, disabled: false, textContent: '', reportValidity: () => true }); return nodes.get(id); };
  let finish, fail = false, lost = false;
  const state = new Script(source + ';({expire(){invitationExpires=0;}})').runInNewContext({ $, location: { origin: 'https://example.org' }, navigator: {}, Date, encodeURIComponent, TypeError, SyntaxError,
    api: async (path, method, data) => {
      calls.push({ path, method, data });
      if (path.endsWith('/email')) { if (finish === null) await new Promise(resolve => { finish = resolve; }); if (lost) throw new TypeError('fetch failed'); if (fail) throw new Error('Envoi indisponible.'); return { ok: true }; }
      return { token: 'a'.repeat(64), expires: Date.now() + 86400000 };
    }
  });
  const submit = () => $('invitation-email-form').onsubmit({ preventDefault() {} });
  await $('create-invitation').onclick(); assert.equal(calls.length, 1);
  $('invitation-email').value = 'personne@example.org';
  await submit(); assert.equal(calls.length, 1); // Hidden when SMTP is not configured.
  $('server-email').hidden = false;
  $('invitation-email-form').reportValidity = () => false; await submit(); assert.equal(calls.length, 1);
  $('invitation-email-form').reportValidity = () => true;
  finish = null; const sending = submit();
  assert.equal($('invitation-email').disabled, true); assert.match($('send-invitation-email').textContent, /Envoi en cours/);
  await submit(); await $('create-invitation').onclick(); await $('revoke-invitation').onclick(); assert.equal(calls.length, 2);
  assert.equal(calls[1].data.to, 'personne@example.org'); assert.equal(calls[1].data.token, 'a'.repeat(64));
  finish(); await sending; assert.equal($('invitation-email').value, ''); assert.equal($('invitation-email').disabled, false);
  assert.match($('invitation-email-status').textContent, /acceptée par le service/); assert.match($('send-invitation-email').textContent, /Envoyer l’invitation/);
  fail = true; $('invitation-email').value = 'second@example.org'; await submit();
  assert.equal($('invitation-email').value, 'second@example.org'); assert.match($('invitation-email-status').textContent, /indisponible/);
  lost = true; await submit(); assert.match($('invitation-email-status').textContent, /Vérifie la boîte/); assert.equal($('invitation-email').value, 'second@example.org');
  const before = calls.length; state.expire(); await submit(); assert.equal(calls.length, before); assert.match($('invitation-email-status').textContent, /expiré/);
});

test('enregistrer une recette bloque les doubles appuis, conserve la saisie en cas d’échec et ne rejoue pas une sauvegarde confirmée', async () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.match(/    async function saveRecipe[\s\S]*?(?=\n    document.getElementById\('days'\))/)[0];
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false, hidden: true, focus() { this.focused = true; }, setAttribute(name, value) { this[name] = value; } });
    return nodes.get(id);
  };
  const values = { 'recipe-title': 'Mon curry', 'recipe-source': 'https://example.org/curry', 'recipe-minutes': '30', 'recipe-servings': '2', 'recipe-diet': 'vegan', 'recipe-tags': 'rapide, japon' };
  for (const [id, value] of Object.entries(values)) node(id).value = value;
  const row = values => ({ querySelector: selector => ({ value: values[selector] }) });
  const lists = {
    '.ingredient-row': [row({ '.ingredient-name': 'Carotte', '.ingredient-amount': '200', '.ingredient-unit': 'g', '.ingredient-state': 'cooked' })],
    '.step-row': [row({ '.step-kind': 'cook', '.step-instruction': 'Cuire les carottes.', '.step-minutes': '' })],
    '#recipe-categories input:checked': [{ value: 'japon' }]
  };
  let request, calls = 0, closes = 0, refreshes = 0, failRefresh = false;
  const context = {
    document: { getElementById: node, querySelectorAll: selector => lists[selector] },
    photoBusy: false, recipePhoto: 'data:image/jpeg;base64,test', recipePhotoCopyId: 12,
    recipeCategories: { japon: 'Japon' }, editingRecipeId: null, AbortSignal,
    recipeDialog: { close: () => closes++ },
    fetch: (path, options) => { calls++; request = { path, ...options }; return context.reply(); },
    load: async () => { refreshes++; if (failRefresh) throw new Error('Lecture indisponible'); }
  };
  const save = new Script(source + ';saveRecipe').runInNewContext(context);
  const submit = () => save({ preventDefault() {} });
  context.photoBusy = true; await submit(); assert.equal(calls, 0); assert.equal(node('recipe-photo-options').open, true);
  context.photoBusy = false;
  let release;
  context.reply = () => new Promise(resolve => { release = resolve; });
  const pending = submit();
  assert.equal(node('recipe-fields').disabled, true); assert.equal(node('close-recipe-dialog').disabled, true);
  assert.equal(node('save-recipe').textContent, 'Enregistrement…'); assert.equal(node('recipe-form')['aria-busy'], 'true');
  await submit(); assert.equal(calls, 1);
  const payload = JSON.parse(request.body);
  assert.equal(request.path, '/api/recipes'); assert.equal(request.method, 'POST'); assert.ok(request.signal instanceof AbortSignal);
  assert.equal(payload.title, 'Mon curry'); assert.deepEqual(payload.tags, ['rapide', 'japon']); assert.equal(payload.steps[0].minutes, null);
  assert.equal(payload.ingredients[0].preparation, 'cooked'); assert.equal(payload.photoCopyId, 12); assert.equal(payload.photo, context.recipePhoto);
  release({ ok: false, json: async () => ({ error: 'Quantité invalide' }) }); await pending;
  assert.equal(closes, 0); assert.equal(refreshes, 0); assert.equal(node('recipe-error').textContent, 'Quantité invalide');
  assert.equal(node('recipe-error').hidden, false); assert.equal(node('recipe-fields').disabled, false);
  assert.equal(node('close-recipe-dialog').disabled, false); assert.equal(node('save-recipe').textContent, 'Enregistrer');
  assert.equal(node('save-recipe').focused, true);
  assert.equal(node('recipe-form')['aria-busy'], 'false');
  context.reply = async () => { throw new TypeError('Failed to fetch'); };
  await submit(); assert.match(node('recipe-error').textContent, /saisie est conservée.*peut-être abouti/);
  context.reply = async () => { throw { name: 'TimeoutError' }; };
  await submit(); assert.match(node('recipe-error').textContent, /Connexion interrompue/);
  context.reply = async () => ({ ok: false, json: async () => { throw new Error('HTML'); } });
  await submit(); assert.match(node('recipe-error').textContent, /refusé par le serveur/);
  for (const [id, value] of Object.entries(values)) assert.equal(node(id).value, value);
  context.editingRecipeId = 7; failRefresh = true;
  context.reply = async () => ({ ok: true });
  await submit(); assert.equal(request.path, '/api/recipes/7'); assert.equal(request.method, 'PUT');
  assert.equal(calls, 5); assert.equal(closes, 1); assert.equal(refreshes, 1);
  assert.equal(node('recipe-error').hidden, true); assert.equal(node('recipe-fields').disabled, false);
});

test('planifier un repas bloque les doubles appuis, garde les choix après un échec et sépare sauvegarde et rechargement', async () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const source = html.match(/    async function postMeal[\s\S]*?(?=\n    function compatibleProteins)/)[0];
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { disabled: false, hidden: true, contains: el => el === focused, setAttribute(name, value) { this[name] = value; } });
    return nodes.get(id);
  };
  const focused = { focus() { this.focused = true; } };
  node('dialog-subtitle').textContent = 'Qui mange et avec quelle protéine ?';
  const payload = { date: '2026-10-01', slot: 'soir', location: 'home', occasion: 'regular', people: 2, title: 'Curry', recipeId: null, assignments: [], dishes: [{ memberId: 1, recipeId: 2, portions: 1, proteinId: null }, { memberId: 2, recipeId: 3, portions: 1, proteinId: 4 }] };
  let request, calls = 0, closes = 0, refreshes = 0, failRefresh = false;
  const context = {
    document: { getElementById: node, activeElement: focused }, AbortSignal,
    dialog: { close() { closes++; } },
    fetch: (path, options) => { calls++; request = { path, ...options }; return context.reply(); },
    load: async () => { refreshes++; assert.equal(node('meal-fields').disabled, false); if (failRefresh) throw new Error('Lecture indisponible'); }
  };
  const save = new Script(source + ';postMeal').runInNewContext(context);
  let release;
  context.reply = () => new Promise(resolve => { release = resolve; });
  const pending = save(payload);
  assert.equal(node('meal-fields').disabled, true); assert.equal(node('close-dialog').disabled, true);
  assert.equal(node('meal-fields')['aria-busy'], 'true'); assert.equal(node('dialog-subtitle').textContent, 'Enregistrement…');
  await save(payload); assert.equal(calls, 1);
  assert.equal(request.path, '/api/meals'); assert.equal(request.method, 'POST'); assert.ok(request.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(request.body), payload);
  release({ ok: false, json: async () => ({ error: 'Recette incompatible avec le régime' }) }); await pending;
  assert.equal(closes, 0); assert.equal(refreshes, 0); assert.equal(node('dialog-error').textContent, 'Recette incompatible avec le régime');
  assert.equal(node('meal-fields').disabled, false); assert.equal(node('close-dialog').disabled, false);
  assert.equal(node('meal-fields')['aria-busy'], 'false'); assert.equal(node('dialog-subtitle').textContent, 'Qui mange et avec quelle protéine ?');
  assert.equal(node('dialog-error').hidden, false); assert.equal(focused.focused, true);
  context.reply = async () => { throw new TypeError('Failed to fetch'); };
  await save(payload); assert.match(node('dialog-error').textContent, /choix sont conservés.*peut-être abouti/);
  context.reply = async () => { throw { name: 'TimeoutError' }; };
  await save(payload); assert.match(node('dialog-error').textContent, /Connexion interrompue/);
  context.reply = async () => ({ ok: false, json: async () => { throw new Error('HTML'); } });
  await save(payload); assert.match(node('dialog-error').textContent, /refusé par le serveur/);
  assert.deepEqual(JSON.parse(request.body), payload);
  context.reply = async () => ({ ok: true }); failRefresh = true;
  await save(payload); assert.equal(calls, 5); assert.equal(closes, 1); assert.equal(refreshes, 1);
  assert.equal(node('dialog-error').hidden, true); assert.equal(node('meal-fields').disabled, false);
});

test('les coches hors connexion persistent localement sans écraser une nouvelle copie ni perdre les données si le stockage échoue', () => {
  const html = readFileSync(join(__dirname, 'public', 'offline.html'), 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new Script(match[1]);
  const original = JSON.stringify({ week: '2026-09-28', savedAt: '2026-09-30T12:00:00Z', items: [{ text: '2 tomates', checked: false }, { text: 'Sel', checked: true }] });
  let stored = original, full = false;
  const localStorage = {
    getItem: () => stored,
    setItem: (key, value) => { assert.equal(key, 'manger-shopping-offline-v1'); if (full) throw new Error('QuotaExceededError'); stored = value; }
  };
  const save = new Script(html.match(/function saveShoppingCheck[\s\S]*?(?=function shoppingProgress)/)[0] + ';saveShoppingCheck').runInNewContext({ localStorage });
  let revision = save(original, 0, true);
  assert.deepEqual(JSON.parse(stored), { ...JSON.parse(original), items: [{ text: '2 tomates', checked: true }, { text: 'Sel', checked: true }] });
  revision = save(revision, 0, false); assert.equal(stored, original);
  full = true; assert.throws(() => save(revision, 0, true), /Quota/); assert.equal(stored, original);
  full = false; stored = JSON.stringify({ week: '2026-10-05', items: [{ text: 'Riz', checked: false }] });
  const replacement = stored;
  assert.throws(() => save(revision, 0, true), /copie a changé/); assert.equal(stored, replacement);
  stored = null; assert.throws(() => save(revision, 0, true), /copie a changé/); assert.equal(stored, null);
});

test('la dernière semaine demandée seule actualise le planning, une erreur préserve l’affichage et Réessayer reprend la demande sans écriture', async () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const state = { weekStart: new Date('2026-09-28T12:00:00'), selected: 2, meals: [], shopping: [] };
  const nodes = new Map(), requests = new Map(); let renders = 0, copies = 0;
  const response = data => ({ ok: true, json: async () => data });
  const script = html.match(/    let shoppingSyncVersion[\s\S]*?(?=\n    function render\()/)[0];
  const { load, retryConnection } = new Script(script + ';({load,retryConnection})').runInNewContext({
    state, Date, AbortSignal, location: { protocol: 'http:' }, key: date => date.toISOString().slice(0, 10),
    document: { getElementById: id => { if (!nodes.has(id)) nodes.set(id, { setAttribute(name, value) { this[name] = value; } }); return nodes.get(id); } },
    fetch: path => path === '/api/household' ? Promise.resolve(response({ members: [] })) : new Promise((resolve, reject) => requests.set(path.split('=')[1], { resolve, reject })),
    render: () => renders++, saveOfflineShopping: () => copies++
  });
  const old = load({ weekStart: new Date('2026-10-05T12:00:00'), selected: 0 });
  const latest = load({ weekStart: new Date('2026-10-12T12:00:00'), selected: 3 });
  assert.equal(state.weekStart.toISOString().slice(0, 10), '2026-09-28');
  assert.equal(nodes.get('week-content').disabled, true);
  requests.get('2026-10-12').resolve(response({ meals: [{ title: 'Nouveau repas' }], shopping: [{ name: 'Riz' }] }));
  assert.equal(await latest, true);
  requests.get('2026-10-05').resolve(response({ meals: [{ title: 'Ancien repas' }], shopping: [] }));
  assert.equal(await old, false);
  assert.equal(state.weekStart.toISOString().slice(0, 10), '2026-10-12'); assert.equal(state.selected, 3);
  assert.equal(state.meals[0].title, 'Nouveau repas'); assert.equal(state.shopping[0].name, 'Riz');
  assert.equal(renders, 1); assert.equal(copies, 1); assert.equal(nodes.get('week-content').disabled, false);
  const failed = load({ weekStart: new Date('2026-10-19T12:00:00'), selected: 0 });
  requests.get('2026-10-19').reject(new Error('Connexion coupée'));
  await assert.rejects(failed, /Connexion coupée/);
  assert.equal(state.weekStart.toISOString().slice(0, 10), '2026-10-12'); assert.equal(state.meals[0].title, 'Nouveau repas');
  assert.equal(nodes.get('week-panel')['aria-busy'], 'false'); assert.equal(nodes.get('week-content').disabled, false);
  assert.equal(nodes.get('connection-error').hidden, false); assert.match(nodes.get('connection-message').textContent, /contenu déjà affiché est conservé/);
  assert.equal(nodes.get('retry-connection').disabled, false);
  const retry = retryConnection();
  nodes.set('shopping-error', { hidden: false });
  assert.equal(nodes.get('retry-connection').disabled, true); assert.equal(nodes.get('retry-connection').textContent, 'Chargement…');
  assert.equal(requests.size, 3);
  requests.get('2026-10-19').resolve(response({ meals: [{ title: 'Repas retrouvé' }], shopping: [] }));
  await retry;
  assert.equal(state.weekStart.toISOString().slice(0, 10), '2026-10-19'); assert.equal(state.selected, 0);
  assert.equal(state.meals[0].title, 'Repas retrouvé'); assert.equal(nodes.get('connection-error').hidden, true);
  assert.equal(nodes.get('shopping-error').hidden, true);
  assert.equal(nodes.get('retry-connection').disabled, false); assert.equal(nodes.get('retry-connection').textContent, 'Réessayer');
  const staleFailure = load({ weekStart: new Date('2026-10-26T12:00:00') });
  const newer = load({ weekStart: new Date('2026-11-02T12:00:00') });
  requests.get('2026-11-02').resolve(response({ meals: [], shopping: [] })); await newer;
  requests.get('2026-10-26').reject(new Error('Erreur ancienne')); assert.equal(await staleFailure, false);
  assert.equal(nodes.get('connection-error').hidden, true); assert.equal(state.weekStart.toISOString().slice(0, 10), '2026-11-02');
});
