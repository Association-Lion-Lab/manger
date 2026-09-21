const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createDatabase, createApp } = require('./server');

test('lecture légère des courses : même calcul, état frais, semaines isolées et date validée', async t => {
  const db = createDatabase(':memory:'); const server = createApp(db);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const start = '2026-10-05';
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  await post('/api/shopping-manual', { weekStart: start, name: 'Café', amount: 1, unit: 'paquet', aisle: 'Épicerie' });
  const response = await fetch(`${base}/api/shopping?start=${start}`);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const items = await response.json();
  assert.deepEqual(items, (await (await fetch(`${base}/api/week?start=${start}`)).json()).shopping);
  assert.equal((await post('/api/shopping-checks', { weekStart: start, name: items[0].name, unit: items[0].unit, manualId: items[0].manualId, checked: true })).status, 200);
  assert.equal((await (await fetch(`${base}/api/shopping?start=${start}`)).json())[0].checked, true);
  assert.deepEqual(await (await fetch(`${base}/api/shopping?start=2026-10-12`)).json(), []);
  for (const query of ['', '?start=2026-02-30', '?start=invalid']) assert.equal((await fetch(`${base}/api/shopping${query}`)).status, 400);
});
