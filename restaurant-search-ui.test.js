const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

function search() {
  const nodes = new Map(), requests = [], timers = new Map(), positions = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false, hidden: false, isConnected: true, innerHTML: '', textContent: '',
      setAttribute(name, value) { this[name] = value; }, querySelectorAll: () => [node('find-restaurants'), node('find-place'), node('restaurant-place')] });
    return nodes.get(id);
  };
  node('restaurant-place').value = ' Arras ';
  const context = { AbortController, DOMException, dialog: { open: true }, document: { getElementById: node },
    navigator: { geolocation: { getCurrentPosition(success, failure, options) { positions.push({ success, failure, options }); } } },
    setTimeout(callback, delay) { const timer = {}; timers.set(timer, { callback, delay }); return timer; }, clearTimeout(timer) { timers.delete(timer); },
    fetch(path, options) { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); requests.push({ path, options, resolve, reject }); return promise; },
    escapeHtml: value => String(value).replaceAll('<', '&lt;'), choice: (_, name, detail, data) => `<button data-place="${data.place || ''}">${name} ${detail}</button>`
  };
  const source = html.match(/^    let restaurantSearch[\s\S]*?(?=\n    async function saveEvent)/m)[0];
  const actions = new Script(source + ';({findPlaces,findRestaurants,runRestaurantSearch,searchRestaurantPosition,cancelRestaurantSearch})').runInNewContext(context);
  return { node, requests, positions, timers, context, ...actions,
    response: data => ({ ok: true, json: async () => data }),
    place: () => actions.runRestaurantSearch(signal => actions.searchRestaurantPosition(50.29, 2.77, signal, 'Arras'), 'Recherche des restaurants…') };
}

test('restaurants : recherches exclusives, saisie conservée, durée bornée et états des contrôles restaurés', async () => {
  const form = search(); form.node('find-restaurants').disabled = true;
  const pending = form.findPlaces(); await form.findPlaces(); await form.findRestaurants(); await form.place();
  assert.equal(form.requests.length, 1); assert.equal(form.positions.length, 0); assert.equal(form.requests[0].path, '/api/places?query=Arras');
  assert.equal(form.node('restaurant-place').disabled, true); assert.equal(form.node('event-restaurant-search')['aria-busy'], 'true');
  assert.equal([...form.timers.values()][0].delay, 15000);
  form.requests[0].resolve(form.response([{ name: 'Arras', postalCodes: ['62000'], latitude: 50, longitude: 2 }])); await pending;
  assert.match(form.node('restaurant-results').innerHTML, /Arras.*62000/); assert.equal(form.node('restaurant-place').value, ' Arras ');
  assert.equal(form.node('find-restaurants').disabled, true); assert.equal(form.node('find-place').disabled, false);
  assert.equal(form.node('event-restaurant-search')['aria-busy'], 'false'); assert.equal(form.timers.size, 0);
});

test('restaurants : annuler puis reprendre ignore l’ancien résultat sans déverrouiller la nouvelle recherche', async () => {
  const form = search(), first = form.findPlaces(); form.cancelRestaurantSearch();
  assert.equal(form.requests[0].options.signal.aborted, true); assert.equal(form.node('find-place').disabled, false);
  const second = form.findPlaces(); form.requests[0].resolve(form.response([{ name: 'Ancienne commune' }])); await first;
  assert.equal(form.node('find-place').disabled, true); assert.doesNotMatch(form.node('restaurant-results').innerHTML, /Ancienne/);
  form.requests[1].resolve(form.response([{ name: 'Actuelle' }])); await second;
  assert.match(form.node('restaurant-results').innerHTML, /Actuelle/); assert.equal(form.node('find-place').disabled, false);
  assert.match(html, /dialog.addEventListener\('close', cancelRestaurantSearch\)/);
  assert.match(html, /function openEventSetup[^]*?cancelRestaurantSearch\(\)/);
  assert.match(html, /'event-location'\).addEventListener\('change', \(\) => \{\s*cancelRestaurantSearch\(\)/);
  assert.match(html, /async function postMeal[^]*?if \(fields.disabled\) return;\s*cancelRestaurantSearch\(\)/);
});

test('restaurants : fermer, masquer ou remplacer le résultat interdit toute réponse tardive', async () => {
  for (const exit of ['close', 'hide', 'replace']) {
    const form = search(), pending = form.place();
    if (exit === 'close') form.context.dialog.open = false;
    if (exit === 'hide') form.node('event-restaurant-search').hidden = true;
    if (exit === 'replace') form.node('restaurant-results').isConnected = false;
    form.requests[0].resolve(form.response([{ name: 'Ancien restaurant', latitude: 50, longitude: 2 }])); await pending;
    assert.doesNotMatch(form.node('restaurant-results').innerHTML, /Ancien/); assert.equal(form.node('find-place').disabled, false);
    await form.findPlaces(); assert.equal(form.requests.length, 1);
  }
});

test('restaurants : localisation annulée ou expirée ne transmet jamais une position arrivée trop tard', async () => {
  for (const expired of [false, true]) {
    const form = search(), pending = form.findRestaurants();
    assert.equal(form.positions[0].options.timeout, 20000); assert.equal([...form.timers.values()][0].delay, 35000);
    if (expired) [...form.timers.values()][0].callback(); else form.cancelRestaurantSearch();
    await pending;
    form.positions[0].success({ coords: { latitude: 50, longitude: 2 } }); await Promise.resolve();
    assert.equal(form.requests.length, 0); assert.equal(form.node('find-restaurants').disabled, false);
    assert.equal(form.timers.size, 0);
    if (expired) assert.match(form.node('restaurant-results').innerHTML, /dépassé le délai/);
  }
});

test('restaurants : erreurs de localisation, commune vide et absence de géolocalisation ont un repli lisible', async () => {
  for (const code of [1, 2, 3, 9]) {
    const form = search(), pending = form.findRestaurants(); form.positions[0].failure({ code }); await pending;
    assert.match(form.node('restaurant-results').innerHTML, /commune/); assert.equal(form.requests.length, 0);
    assert.equal(form.node('find-restaurants').disabled, false);
  }
  const form = search(); form.node('restaurant-place').value = ' '; await form.findPlaces(); assert.equal(form.requests.length, 0);
  assert.match(form.node('restaurant-results').innerHTML, /Saisis une ville/);
  form.context.navigator.geolocation = null; await form.findRestaurants(); assert.match(form.node('restaurant-results').innerHTML, /pas disponible/);
});

test('restaurants : réseau, délai, refus sans JSON et réponse invalide libèrent les contrôles sans écriture ni reprise automatique', async () => {
  for (const kind of ['network', 'timeout', 'refusal', 'invalid']) {
    const form = search(), pending = form.findPlaces(), request = form.requests[0];
    if (kind === 'network') request.reject(new TypeError('fetch failed'));
    if (kind === 'timeout') { [...form.timers.values()][0].callback(); request.reject(request.options.signal.reason); }
    if (kind === 'refusal') request.resolve({ ok: false, json: async () => { throw new SyntaxError('HTML'); } });
    if (kind === 'invalid') request.resolve(form.response({ error: {} }));
    await pending; assert.match(form.node('restaurant-results').innerHTML, /Réessaie|réessaie/);
    assert.doesNotMatch(form.node('restaurant-results').innerHTML, /fetch failed|HTML|\[object Object\]/);
    assert.equal(form.node('find-place').disabled, false); assert.equal(form.timers.size, 0); assert.equal(form.requests.length, 1);
  }
});

test('restaurants : position obtenue et commune choisie passent par la même protection, erreurs échappées et sans réservation', async () => {
  const form = search(), pending = form.findRestaurants();
  form.positions[0].success({ coords: { latitude: 50.29, longitude: 2.77 } }); await Promise.resolve(); await Promise.resolve();
  assert.equal(form.requests[0].path, '/api/restaurants'); assert.deepEqual(JSON.parse(form.requests[0].options.body), { latitude: 50.29, longitude: 2.77 });
  assert.ok(form.requests[0].options.signal instanceof AbortSignal);
  form.requests[0].resolve(form.response([])); await pending; assert.match(form.node('restaurant-results').innerHTML, /Aucun restaurant/);
  const next = form.place(); form.requests[1].resolve(form.response([{ name: 'Test', distance: 120, cuisine: 'japanese', latitude: 50, longitude: 2 }])); await next;
  assert.match(form.node('restaurant-results').innerHTML, /Arras.*120 m.*Voir sur la carte/);
  const error = form.findPlaces(); form.requests[2].resolve({ ok: false, json: async () => ({ error: '<script>' }) }); await error;
  assert.match(form.node('restaurant-results').innerHTML, /&lt;script>/); assert.equal(form.requests.length, 3);
});
