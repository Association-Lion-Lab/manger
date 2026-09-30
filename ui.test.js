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

test('la dernière semaine demandée seule actualise le planning et une erreur préserve la semaine affichée', async () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const state = { weekStart: new Date('2026-09-28T12:00:00'), selected: 2, meals: [], shopping: [] };
  const nodes = new Map(), requests = new Map(); let renders = 0, copies = 0;
  const response = data => ({ ok: true, json: async () => data });
  const script = html.match(/    let shoppingSyncVersion[\s\S]*?(?=\n    function render\()/)[0];
  const { load } = new Script(script + ';({load})').runInNewContext({
    state, Date, AbortSignal, key: date => date.toISOString().slice(0, 10),
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
});
