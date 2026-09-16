const test = require('node:test');
const assert = require('node:assert/strict');
const { once, EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { runInNewContext } = require('node:vm');
const { publicIPv4, importUrl, resolvePublic, durationMinutes, ingredientDraft, extractRecipeDraft } = require('./recipe-import');
const { createApp, createDatabase, recipes } = require('./server');

test('le parseur récupère une recette JSON-LD sans exécuter le HTML', () => {
  const node = { '@type': ['Recipe'], name: 'Riz &amp; légumes', totalTime: 'PT1H15M', recipeYield: '4 personnes', recipeIngredient: ['200 g de riz', '1½ l d’eau', '2 œufs', 'sel au goût'], recipeInstructions: [{ '@type': 'HowToSection', name: 'Cuisson', itemListElement: [{ '@type': 'HowToStep', text: '<p>Faire cuire le riz.</p>' }, { text: 'Dresser les assiettes.' }] }] };
  const html = `<script>throw new Error('ne pas exécuter')</script><script type="application/ld+json">bad</script><script type='application/ld+json'>${JSON.stringify({ '@graph': [node] })}</script>`;
  const result = extractRecipeDraft(html, 'https://example.org/recette');
  const recipe = result.recipes[0];
  assert.equal(recipe.title, 'Riz & légumes'); assert.equal(recipe.minutes, 75); assert.equal(recipe.servings, 4);
  assert.equal(recipe.diet, 'omnivore'); assert.equal(recipe.steps.length, 2); assert.equal(recipe.steps[0].instruction, 'Faire cuire le riz.');
  assert.deepEqual(recipe.ingredients[1], { name: 'eau', unit: 'l', amount: 1.5 });
  assert.equal(recipe.ingredients[3].unit, 'à ajuster'); assert.ok(result.warnings.some(warning => warning.includes('à ajuster')));
  assert.deepEqual(ingredientDraft('1/2 c. à café de sucre'), { name: 'sucre', unit: 'c. à café', amount: .5 });
  assert.equal(durationMinutes('P1DT1H'), null); assert.equal(durationMinutes('PT90S'), 2);
  assert.throws(() => extractRecipeDraft('<html>pas de recette</html>', ''), /Aucune recette/);
  assert.throws(() => extractRecipeDraft('<script>'.repeat(100000), ''), /Aucune recette/);
});

test('les liens privés, IPv6, ports et DNS mixtes sont refusés', async () => {
  for (const ip of ['127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::1']) assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4('93.184.215.14'), true);
  for (const url of ['http://example.org', 'file:///etc/passwd', 'https://user:pass@example.org', 'https://example.org:3000', 'https://[::1]/']) assert.throws(() => importUrl(url));
  await assert.rejects(resolvePublic('example.org', async () => [{ address: '93.184.215.14' }, { address: '10.0.0.1' }]), /interdites/);
  await assert.rejects(resolvePublic('127.0.0.1', async () => [{ address: '127.0.0.1' }]), /interdites/);
});

test('le téléchargement épingle le DNS validé et vérifie les redirections', async () => {
  const code = readFileSync(join(__dirname, 'recipe-import.js'), 'utf8');
  let connects = 0;
  let redirect = false;
  const fakeGet = (url, options, callback) => {
    connects++;
    assert.equal(options.agent, false);
    options.lookup(url.hostname, {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '93.184.215.14'); assert.equal(family, 4); });
    const request = new EventEmitter(); request.destroy = error => request.emit('error', error);
    queueMicrotask(() => {
      const response = Readable.from([Buffer.from('<html>ok</html>')]);
      response.statusCode = redirect ? 302 : 200;
      response.headers = redirect ? { location: 'https://127.0.0.1/secret' } : { 'content-type': 'text/html' };
      callback(response);
    });
    return request;
  };
  const sandbox = { module: { exports: {} }, Buffer, URL, setTimeout, clearTimeout, require: name => name === 'node:https' ? { get: fakeGet } : name === 'node:dns/promises' ? { lookup: async host => [{ address: host === '127.0.0.1' ? '127.0.0.1' : '93.184.215.14', family: 4 }] } : require(name) };
  runInNewContext(code, sandbox);
  const download = sandbox.module.exports.downloadRecipePage;
  assert.equal((await download('https://example.org/recipe')).html, '<html>ok</html>');
  assert.equal(connects, 1);
  redirect = true;
  await assert.rejects(download('https://example.org/redirect'), /interdites/);
  assert.equal(connects, 2, 'aucune connexion vers la cible privée');
});

test('export et aperçu JSON ne modifient rien, création conserve source et ne remplace pas', async t => {
  const db = createDatabase(':memory:'); const server = createApp(db);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const before = recipes(db);
  const exported = await (await fetch(base + '/api/recipes/export')).json();
  assert.equal(exported.format, 'manger-recipes'); assert.equal(exported.version, 1);
  const preview = await (await post('/api/recipes/import-preview', { kind: 'file', data: exported })).json();
  assert.equal(preview.recipes.length, before.length); assert.equal(preview.recipes[0].id, undefined);
  assert.deepEqual(recipes(db), before);
  const legacy = await (await post('/api/recipes/import-preview', { kind: 'file', data: { ...exported, recipes: [{ ...exported.recipes[0], steps: [] }] } })).json();
  assert.deepEqual(legacy.recipes[0].steps, []);
  assert.ok(legacy.warnings.some(warning => warning.includes('complète-les')));
  assert.deepEqual(recipes(db), before);
  const input = { ...preview.recipes[0], sourceUrl: 'https://example.org/recipe' };
  const saved = await (await post('/api/recipes', input)).json();
  assert.equal(saved.sourceUrl, input.sourceUrl); assert.notEqual(saved.id, before[0].id);
  assert.equal(recipes(db).length, before.length + 1);
  assert.equal((await post('/api/recipes', { ...input, sourceUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await post('/api/recipes/import-preview', { kind: 'file', data: { ...exported, version: 2 } })).status, 400);
  assert.equal((await post('/api/recipes/import-preview', { kind: 'file', data: { ...exported, recipes: [{ ...input, servings: -1 }] } })).status, 400);
  assert.equal((await post('/api/recipes/import-preview', { kind: 'url', url: 'file:///etc/passwd' })).status, 400);
  assert.equal((await post('/api/recipes/import-preview', { kind: 'url', url: 'https://127.0.0.1/private' })).status, 400);
  assert.equal(recipes(db).length, before.length + 1);
});
