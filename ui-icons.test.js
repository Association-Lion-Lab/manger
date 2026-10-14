const test = require('node:test');
const assert = require('node:assert/strict');

test('les icônes d’interface sont vectorielles, décoratives et de même épaisseur', () => {
  const { icon } = require('./public/ui-icons');
  for (const name of ['plus', 'close', 'heart', 'pot', 'location', 'people', 'share', 'download', 'leaf', 'clock']) {
    const svg = icon(name);
    assert.match(svg, /<svg class="ui-icon"/);
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /stroke-width="1.8"/);
    assert.match(svg, /aria-hidden="true" focusable="false"/);
    assert.match(svg, new RegExp(`data-ui-name="${name}"`));
  }
  assert.equal(icon('♨'), icon('pot'));
  assert.equal(icon('♥'), icon('heart'));
  assert.equal(icon('×'), icon('trash'));
});

test('un nom inconnu ne peut pas injecter du contenu dans une icône', () => {
  const { icon } = require('./public/ui-icons');
  for (const name of ['<img src=x onerror=alert(1)>', '__proto__', 'constructor', null]) {
    assert.equal(icon(name), icon('circle'));
  }
});

test('les univers gardent leurs émojis et les régimes restent explicites', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  assert.match(html, /const \[icon, \.\.\.words\] = label.split/);
  assert.doesNotMatch(html, /MangerIcons.categoryIcon/);
  for (const emoji of ['🐀', '🇯🇵', '🇨🇳', '🍲', '🐟', '🥚', '🌱']) assert.ok(html.includes(emoji));
});

test('le serveur expose les icônes avant le script de l’interface', async t => {
  const { once } = require('node:events');
  const { createApp, createDatabase } = require('./server');
  const db = createDatabase(':memory:'), server = createApp(db);
  t.after(() => { server.close(); db.close(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/ui-icons.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(await response.text(), /root.MangerIcons/);
  const html = await (await fetch(base)).text();
  assert.ok(html.indexOf('src="/ui-icons.js"') >= 0);
  assert.ok(html.indexOf('src="/ui-icons.js"') < html.indexOf('const uiIcon = MangerIcons.icon'));
});
