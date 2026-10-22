const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createDatabase } = require('./server');
const { createAccount, openAccounts } = require('./accounts');

test('confidentialité et licences : même information repliée avant et après connexion, sans ouvrir les données', async t => {
  const data = createDatabase(':memory:'), accounts = openAccounts(':memory:');
  await createAccount(accounts, 'member', 'information-test-password');
  const server = createApp(data, accounts);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); data.close(); accounts.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, cookie) => fetch(base + path, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  const information = html => {
    const blocks = [...html.matchAll(/<details id="privacy-licenses" class="privacy-licenses">[\s\S]*?<\/details>/g)];
    assert.equal(blocks.length, 1, 'une seule rubrique, fermée par défaut');
    assert.doesNotMatch(html, /<!-- MANGER_INFORMATION -->/);
    assert.match(blocks[0][0], /<summary>Confidentialité et licences<\/summary>/);
    assert.doesNotMatch(blocks[0][0], /<(?:script|input|form)\b/);
    return blocks[0][0];
  };
  const landing = await get('/login'); assert.equal(landing.status, 200);
  const content = information(await landing.text());
  assert.equal(information(await (await get('/account')).text()), content);
  for (const path of ['/api/household', '/api/recipes', '/api/backup', '/public/information.html']) {
    assert.equal((await get(path)).status, 401, path);
  }
  const login = await fetch(base + '/api/account/login', {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'member', password: 'information-test-password' })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const main = await get('/', cookie), html = await main.text();
  assert.equal(main.status, 200);
  assert.equal(Number(main.headers.get('content-length')), Buffer.byteLength(html));
  assert.equal(information(html), content);
  assert.match(html, /<section id="account-panel"[\s\S]*id="privacy-licenses"[\s\S]*?<\/section>/);
  assert.equal(information(await (await get('/account', cookie)).text()), content);
});

test('information : limites réelles, droits des contenus et liens de licence/source sans collecte supplémentaire', async t => {
  const data = createDatabase(':memory:');
  const server = createApp(data);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); data.close(); });
  const html = await (await fetch(`http://127.0.0.1:${server.address().port}`)).text();
  const content = html.match(/<details id="privacy-licenses"[\s\S]*?<\/details>/)?.[0];
  assert.ok(content, 'contenu présent aussi sur une instance de développement sans comptes');
  for (const text of ['administrateur', 'hors connexion', 'désactiver un compte', 'AGPL-3.0-or-later', 'CC0-1.0', 'Nodemailer', 'SMTP', 'PostgreSQL', 'MIT et ISC']) {
    assert.ok(content.includes(text), text);
  }
  assert.match(content, /href="https:\/\/www.gnu.org\/licenses\/agpl-3.0.html"/);
  assert.match(content, /href="https:\/\/codeberg.org\/LION_LAB\/manger"/);
  assert.match(content, /href="https:\/\/creativecommons.org\/publicdomain\/zero\/1.0\/"/);
  for (const link of content.matchAll(/<a\b[^>]*>/g)) assert.match(link[0], /rel="noopener noreferrer"/);
  assert.doesNotMatch(content, /conforme au RGPD|certifié|garanti sans allergène|mailto:|<img\b|<iframe\b/);
});

test('notices distribuées : chaque dépendance de production garde sa version et son texte de licence', () => {
  const { readFileSync, readdirSync } = require('node:fs');
  const { join } = require('node:path');
  const notice = readFileSync(join(__dirname, 'public/third-party-notices.txt'), 'utf8');
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  for (const [path, pkg] of Object.entries(require('./package-lock.json').packages)) {
    if (!path || pkg.dev) continue;
    assert.ok(notice.includes(`${path.slice('node_modules/'.length)}@${pkg.version}`), path);
    const directory = join(__dirname, path);
    const file = readdirSync(directory).find(name => /^license(?:\.md|\.txt)?$/i.test(name));
    const source = file ? readFileSync(join(directory, file), 'utf8') : readFileSync(join(directory, 'README.md'), 'utf8').split(/\n## license\s*\n/i).at(-1);
    assert.match(source, /Permission (?:is hereby granted|to use)/);
    assert.ok(normalize(notice).includes(normalize(source)), `licence intégrale : ${path}`);
  }
});
