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
  assert.equal(nodes.get('retry-connection').disabled, true); assert.equal(nodes.get('retry-connection').textContent, 'Chargement…');
  assert.equal(requests.size, 3);
  requests.get('2026-10-19').resolve(response({ meals: [{ title: 'Repas retrouvé' }], shopping: [] }));
  await retry;
  assert.equal(state.weekStart.toISOString().slice(0, 10), '2026-10-19'); assert.equal(state.selected, 0);
  assert.equal(state.meals[0].title, 'Repas retrouvé'); assert.equal(nodes.get('connection-error').hidden, true);
  assert.equal(nodes.get('retry-connection').disabled, false); assert.equal(nodes.get('retry-connection').textContent, 'Réessayer');
  const staleFailure = load({ weekStart: new Date('2026-10-26T12:00:00') });
  const newer = load({ weekStart: new Date('2026-11-02T12:00:00') });
  requests.get('2026-11-02').resolve(response({ meals: [], shopping: [] })); await newer;
  requests.get('2026-10-26').reject(new Error('Erreur ancienne')); assert.equal(await staleFailure, false);
  assert.equal(nodes.get('connection-error').hidden, true); assert.equal(state.weekStart.toISOString().slice(0, 10), '2026-11-02');
});
