const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recipeSeason, freshProduce, seasonCalendars } = require('./public/seasons.js');
const recipe = (...names) => ({ ingredients: names.map(name => ({ name })) });

test('repères été et hiver, frontière mensuelle comprise', () => {
  assert.equal(recipeSeason(recipe('tomate', 'courgette'), 7).matches, true);
  assert.equal(recipeSeason(recipe('tomate'), 9).matches, true);
  assert.equal(recipeSeason(recipe('tomate'), 10).matches, false);
  assert.equal(recipeSeason(recipe('poireaux', 'carottes'), 1).matches, true);
  assert.equal(recipeSeason(recipe('poireau'), 7).matches, false);
});
test('casse, accents et pluriels connus, sans correction hasardeuse', () => {
  assert.equal(freshProduce('  COncombres '), 'concombre');
  assert.equal(freshProduce('ÉPINARDS'), 'epinard');
  assert.equal(freshProduce('tomates cerises'), 'tomate');
  assert.equal(freshProduce('courgetess'), null);
});
test('inconnu, conserves et aromates ne créent pas une fausse étiquette', () => {
  for (const name of ['sel', 'oignon', 'ail', 'riz', 'poulet', 'tomate concassée', 'sauce tomate', 'haricots verts surgelés', 'poire en conserve', 'jus de pomme', 'carotte séchée']) {
    assert.equal(recipeSeason(recipe(name), 10).matches, false, name);
  }
  assert.equal(recipeSeason(recipe(), 10).matches, false);
  assert.equal(recipeSeason(recipe('carotte', 'poulet', 'riz'), 10).matches, true);
});
test('un ingrédient identifié hors saison empêche le repère positif', () => {
  const source = recipe('carotte', 'tomate', 'carotte');
  const before = JSON.stringify(source);
  assert.deepEqual(recipeSeason(source, 1), { matches: false, inSeason: ['carotte'], outOfSeason: ['tomate'] });
  assert.equal(JSON.stringify(source), before);
});
test('mois invalides refusés et 12 mois utilisables', () => {
  for (const month of [0, 13, '10', NaN, 1.5]) assert.throws(() => recipeSeason(recipe('carotte'), month), RangeError);
  for (let month = 1; month <= 12; month++) assert.equal(recipeSeason(recipe('carotte'), month).matches, true);
});

test('le calendrier national reste le défaut et les régions ont des repères distincts', () => {
  assert.deepEqual(recipeSeason(recipe('tomate'), 7), recipeSeason(recipe('tomate'), 7, 'france'));
  assert.equal(recipeSeason(recipe('betterave'), 4, 'hauts-de-france').matches, false);
  assert.equal(recipeSeason(recipe('betterave'), 4, 'france').matches, true);
  assert.equal(recipeSeason(recipe('pomme'), 5, 'hauts-de-france').matches, true);
  assert.equal(recipeSeason(recipe('pomme'), 8, 'hauts-de-france').matches, false);
  assert.equal(recipeSeason(recipe('pomme'), 8, 'france').matches, true);
  assert.equal(recipeSeason(recipe('épinards', 'carottes'), 8, 'bretagne').matches, true);
  assert.equal(recipeSeason(recipe('épinards', 'carottes'), 8, 'france').matches, false);
  assert.equal(recipeSeason(recipe('endive'), 10, 'bretagne').matches, false);
  assert.equal(recipeSeason(recipe('asperge'), 3, 'bretagne').matches, true);
});

test('couverture limitée explicite, complément national et mêmes exclusions', () => {
  assert.match(seasonCalendars['hauts-de-france'].coverage, /Pommes et betteraves.*calendrier national/);
  assert.match(seasonCalendars.bretagne.coverage, /complétés.*national/);
  assert.match(seasonCalendars.bretagne.coverage, /fin mars/);
  for (const region of Object.keys(seasonCalendars)) {
    assert.equal(new URL(seasonCalendars[region].url).protocol, 'https:');
    for (let month = 1; month <= 12; month++) {
      assert.equal(recipeSeason(recipe('carotte'), month, region).matches, true);
      assert.deepEqual(recipeSeason(recipe('panais'), month, region), recipeSeason(recipe('panais'), month));
      assert.equal(recipeSeason(recipe('tomate concassée', 'sel', 'poulet'), month, region).matches, false);
    }
    assert.equal(recipeSeason(recipe('carotte', 'tomate'), 1, region).matches, false);
  }
  for (const region of ['', 'inconnue', '__proto__', 'constructor', null]) assert.throws(() => recipeSeason(recipe('carotte'), 10, region), RangeError);
});

test('le navigateur reçoit le module après les noms alimentaires', async t => {
  const { once } = require('node:events');
  const { createApp, createDatabase } = require('./server');
  const db = createDatabase(':memory:');
  const server = createApp(db);
  t.after(() => { server.close(); db.close(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/seasons.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(await response.text(), /root.MangerSeasons/);
  const html = await (await fetch(base)).text();
  assert.ok(html.indexOf('src="/food-names.js"') < html.indexOf('src="/seasons.js"'));
  assert.match(html, /id="recipe-season-filter"[^>]*aria-pressed="false"/);
});
