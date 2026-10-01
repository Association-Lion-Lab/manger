const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const { Script } = require('node:vm');
const offline = require('./public/offline-shopping');
const { createApp, createDatabase } = require('./server');

function storage() {
  let raw = null;
  return { getItem: () => raw, setItem: (_, value) => { raw = value; } };
}
const item = { name: 'Tomates', amount: 2, unit: 'pièce', manualId: 1, checked: false, text: '2 tomates' };

test('offline purchases survive refreshes and week changes; unchecks stay local and old copies remain readable', () => {
  const store = storage();
  assert.equal(offline.capture(store, '2026-10-05', [item]), true);
  const copy = offline.read(store); copy.items[0].checked = true;
  store.setItem(offline.KEY, JSON.stringify(copy));
  const revision = store.getItem(offline.KEY);
  assert.equal(offline.pending(copy).length, 1);
  assert.equal(offline.capture(store, '2026-10-12', []), false);
  assert.equal(store.getItem(offline.KEY), revision);
  offline.acknowledge(store, revision, [0]);
  assert.equal(offline.pending(offline.read(store)).length, 0);
  const saved = store.getItem(offline.KEY);
  assert.throws(() => offline.acknowledge(store, revision, [0]), /autre onglet/);
  assert.equal(store.getItem(offline.KEY), saved);
  assert.throws(() => offline.acknowledge(store, saved, [100]), /invalide/);
  const full = { getItem: () => saved, setItem: () => { throw new Error('Quota'); } };
  assert.throws(() => offline.acknowledge(full, saved, [0]), /Quota/);
  const unchecked = offline.read(store); unchecked.items[0].checked = false;
  assert.equal(offline.pending(unchecked).length, 0);
  store.setItem(offline.KEY, JSON.stringify({ items: [{ text: 'Ancienne copie', checked: true }] }));
  assert.equal(offline.pending(offline.read(store)).length, 0);
  assert.equal(offline.capture(store, '2026-10-05', [item]), true);
  for (const patch of [{ amount: '2' }, { name: 4 }, { unit: '' }, { baseChecked: null }, { manualId: -1 }]) {
    store.setItem(offline.KEY, JSON.stringify({ version: 2, week: '2026-10-05', items: [{ ...item, baseChecked: false, ...patch }] }));
    assert.throws(() => offline.read(store), /invalide/);
  }
});

test('server merges only existing unchanged purchases, independently per week, without undoing household checks', async t => {
  const db = createDatabase(':memory:'), server = createApp(db);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`, weekStart = '2026-10-05';
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const shopping = async () => (await fetch(base + '/api/shopping?start=' + weekStart)).json();
  for (const name of ['Café', 'Savon', 'Pain']) await post('/api/shopping-manual', { weekStart, name, amount: 1, unit: 'pièce', aisle: 'Autres' });
  const initial = await shopping();
  await post('/api/shopping-checks', { weekStart, ...initial[1], checked: true });
  db.prepare('UPDATE shopping_manual SET amount=2 WHERE id=?').run(initial[2].manualId);
  const payload = { weekStart, items: [...initial, { name: 'Supprimé', amount: 1, unit: 'pièce', manualId: 999 }] };
  const response = await post('/api/shopping-checks/sync', payload);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: [0, 1], rejected: [2, 3] });
  assert.deepEqual((await shopping()).map(item => item.checked), [true, true, false]);
  assert.deepEqual(await (await post('/api/shopping-checks/sync', payload)).json(), { accepted: [0, 1], rejected: [2, 3] });
  assert.deepEqual(await (await post('/api/shopping-checks/sync', { ...payload, weekStart: '2026-10-12' })).json(), { accepted: [], rejected: [0, 1, 2, 3] });
  for (const data of [null, {}, { ...payload, weekStart: '2026-02-30' }, { weekStart, items: [] }, { weekStart, items: [initial[0], initial[0]] }, { weekStart, items: [{ ...initial[0], amount: '1' }] }, { weekStart, items: [{ ...initial[0], manualId: -1 }] }]) assert.equal((await post('/api/shopping-checks/sync', data)).status, 400);
  // Recipe-generated ingredient identities use the same normalization as regular shopping checks.
  db.prepare("INSERT INTO shopping_checks(week_start,name,unit) VALUES(?,?,?)").run(weekStart, 'Existing', 'g');
  const recipe = (await (await fetch(base + '/api/week?start=' + weekStart)).json()).recipes[0];
  const meal = await post('/api/meals', { date: weekStart, slot: 'soir', occasion: 'regular', location: 'home', people: 2, title: recipe.title, recipeId: recipe.id });
  assert.equal(meal.status, 200, await meal.text());
  const generated = (await shopping()).find(item => !item.manualId);
  assert.ok(generated);
  assert.deepEqual(await (await post('/api/shopping-checks/sync', { weekStart, items: [generated] })).json(), { accepted: [0], rejected: [] });
  assert.equal((await shopping()).find(item => item.name === generated.name && item.unit === generated.unit).checked, true);
  assert.ok(db.prepare("SELECT 1 FROM shopping_checks WHERE name='Existing'").get());
});

test('client guards double presses, retains purchases on failure and does not repeat writes after a failed refresh', async () => {
  const html = readFileSync(require('node:path').join(__dirname, 'public/index.html'), 'utf8');
  const source = html.match(/    async function sendOfflinePurchases[\s\S]*?(?=\n    document.getElementById\('send-offline-purchases'\))/)[0];
  const store = storage(); offline.capture(store, '2026-10-05', [item]);
  const copy = offline.read(store); copy.items[0].checked = true; store.setItem(offline.KEY, JSON.stringify(copy));
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { disabled: false, textContent: '' }); return nodes.get(id); };
  let calls = 0, loads = 0, fail = true, resolve;
  const send = new Script(source + ';sendOfflinePurchases').runInNewContext({
    document: { getElementById: node }, localStorage: store, offlineShopping: offline, AbortSignal,
    renderOfflinePurchases() {}, load: async () => { loads++; throw new Error('Refresh failed'); },
    fetch: async () => { calls++; if (fail) throw new Error('Offline'); await new Promise(done => { resolve = done; }); return { ok: true, json: async () => ({ accepted: [0], rejected: [] }) }; }
  });
  await send(); assert.equal(offline.pending(offline.read(store)).length, 1); assert.match(node('offline-purchases-status').textContent, /conservés/);
  assert.match(node('shopping-share-status').textContent, /conservés/); assert.equal(node('shopping-share-status').hidden, false);
  fail = false;
  const sending = send(); await send(); assert.equal(calls, 2); assert.equal(node('discard-offline-purchases').disabled, true);
  resolve(); await sending;
  assert.equal(offline.pending(offline.read(store)).length, 0); assert.equal(calls, 2); assert.equal(loads, 1); assert.equal(node('send-offline-purchases').disabled, false);
});
