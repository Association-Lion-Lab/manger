const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const { once } = require('node:events');
const { createApp, createDatabase } = require('./server');

const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

test('restaurant manuel : aucun contrôle, ressource ou appel de recherche externe dans la page', () => {
  assert.equal(/Overpass|leaflet|restaurant-map|restaurantSearch|navigator\.geolocation|find-restaurants|find-place|\/api\/places|\/api\/restaurants/.test(html), false);
  for (const path of ['public/restaurant-map.js', 'public/vendor/leaflet/leaflet.js', 'public/vendor/leaflet/leaflet.css']) {
    assert.equal(existsSync(join(__dirname, path)), false, path);
  }
});

test('restaurant manuel : libellé adapté au lieu et nom existant conservé pour les sorties et dates', () => {
  const controls = new Map(); let current = null;
  const node = id => {
    if (!controls.has(id)) controls.set(id, { value: '', addEventListener(name, fn) { this[name] = fn; }, dispatchEvent(event) { this[event.type]?.(event); } });
    return controls.get(id);
  };
  const source = html.match(/    function openEventSetup[\s\S]*?(?=\n    async function saveEvent)/)[0];
  const open = new Script(source + ';openEventSetup').runInNewContext({
    state: { selected: 0, slot: 'midi', recipes: [] }, fullDayNames: ['Jeudi'], Event,
    mealFor: () => current, document: { getElementById: node }, escapeHtml: value => String(value)
  });
  for (const occasion of ['regular', 'date']) {
    current = { occasion, location: 'restaurant', title: 'La Table du quartier', people: 3 };
    open(occasion);
    assert.match(node('choices').innerHTML, /value="La Table du quartier"/);
    assert.equal(node('event-name-label').textContent, 'Nom du restaurant');
    assert.match(node('choices').innerHTML, /id="event-people"[^>]*value="3"/);
    node('event-location').value = occasion === 'date' ? 'home' : 'outside';
    node('event-location').dispatchEvent(new Event('change'));
    assert.equal(node('event-name-label').textContent, 'Nom du repas');
    assert.match(node('choices').innerHTML, /value="La Table du quartier"/);
    if (occasion === 'date') assert.equal(node('date-home-recipes').hidden, false);
  }
  open('guests');
  assert.equal(node('event-name-label').textContent, 'Nom du repas');
});

test('restaurant manuel : ancien service retiré, nom sauvegardé et modifiable sans recette ni courses', async t => {
  const db = createDatabase(':memory:'), server = createApp(db);
  t.after(() => { server.close(); db.close(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, input) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal((await post('/api/restaurants', {})).status, 404);
  for (const path of ['/api/places', '/restaurant-map.js', '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const response = await fetch(base);
  assert.match(response.headers.get('content-security-policy'), /img-src 'self' data:;/);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /openstreetmap/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  for (const occasion of ['regular', 'date']) {
    const input = { date: '2026-10-15', slot: occasion === 'date' ? 'soir' : 'midi', location: 'restaurant', occasion, title: 'La Table du quartier', people: 2, assignments: [], dishes: [], recipeId: null };
    assert.equal((await post('/api/meals', input)).status, 200);
    assert.equal((await post('/api/meals', { ...input, title: 'Restaurant modifié', people: 3 })).status, 200);
    assert.equal((await post('/api/meals', { ...input, title: ' ' })).status, 400);
    const meal = db.prepare('SELECT title, people, location, occasion, recipe_id FROM meals WHERE date = ? AND slot = ?').get(input.date, input.slot);
    assert.equal(meal.title, 'Restaurant modifié'); assert.equal(meal.people, 3);
    assert.equal(meal.location, 'restaurant'); assert.equal(meal.occasion, occasion); assert.equal(meal.recipe_id, null);
  }
  const week = await (await fetch(base + '/api/week?start=2026-10-12')).json();
  assert.equal(week.shopping.length, 0);
});
