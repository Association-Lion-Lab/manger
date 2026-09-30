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
