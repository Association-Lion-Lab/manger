const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase } = require('./server');

test('restaurants : recherche locale sans casse ni accents, nom et cuisine, entrées invalides ignorées', () => {
  const { searchRestaurants } = require('./public/restaurant-map');
  const places = [{ name: 'Bō Ramen', cuisine: 'Japonais' }, { name: 'La Table', cuisine: 'française' }, { name: null }, null];
  assert.equal(searchRestaurants(places, ' BO ').length, 1);
  assert.equal(searchRestaurants(places, 'FRANCAISE')[0].name, 'La Table');
  assert.equal(searchRestaurants(places, 'introuvable').length, 0);
  assert.equal(searchRestaurants(places, '').length, 2);
});

test('restaurants : seuls les points géographiques valides peuvent devenir des repères', () => {
  const { validPosition } = require('./public/restaurant-map');
  assert.equal(validPosition({ latitude: 50.29, longitude: 2.77 }), true);
  for (const place of [{ latitude: 91, longitude: 2 }, { latitude: 50, longitude: Infinity }, { latitude: '50', longitude: 2 }, {}]) assert.equal(validPosition(place), false);
});

test('carte : ressources locales explicites et CSP limitée aux images OSM, politique privée conservée', async t => {
  const db = createDatabase(':memory:'), server = createApp(db);
  t.after(() => { server.close(); db.close(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base);
  assert.match(response.headers.get('content-security-policy'), /img-src 'self' data: https:\/\/tile\.openstreetmap\.org;/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self' 'unsafe-inline';/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  for (const path of ['/restaurant-map.js', '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css']) assert.equal((await fetch(base + path)).status, 200);
  assert.equal((await fetch(base + '/vendor/leaflet/LICENSE')).status, 404);
  assert.equal((await fetch(base + '/vendor/leaflet/package.json')).status, 404);
});
