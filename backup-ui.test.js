const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

function download() {
  const requests = [], urls = [], timers = [], appended = [], revoked = [];
  let resolve, reject, clicks = 0, removed = 0;
  const button = { disabled: false, textContent: 'Télécharger la sauvegarde complète', setAttribute(name, value) { this[name] = value; }, addEventListener(type, listener) { this[type] = listener; } };
  const status = { textContent: '' }, link = { click() { clicks++; if (context.clickFails) throw new Error('Téléchargement refusé'); }, remove() { removed++; } };
  const context = { restoreBusy: false, Date, AbortSignal: { timeout: value => value },
    document: { getElementById: id => id === 'download-backup' ? button : status, createElement: () => link, body: { append: item => appended.push(item) } },
    URL: { createObjectURL(file) { urls.push(file); return 'blob:backup'; }, revokeObjectURL(url) { revoked.push(url); } },
    setTimeout(callback, ms) { timers.push({ callback, ms }); },
    fetch(path, options) { requests.push({ path, options }); return new Promise((yes, no) => { resolve = yes; reject = no; }); } };
  const source = html.match(/^    document.getElementById\('download-backup'\)[\s\S]*?(?=\n    const state =)/m)[0];
  new Script(source).runInNewContext(context);
  return { context, button, status, link, requests, urls, timers, appended, revoked,
    start: () => button.click({ currentTarget: button }), reply: response => resolve(response), fail: error => reject(error), clicks: () => clicks, removed: () => removed };
}

test('sauvegarde : verrou unique jusqu’à la fin du fichier, restauration exclue et téléchargement nettoyé', async () => {
  const form = download(); form.context.restoreBusy = true; await form.start(); assert.equal(form.requests.length, 0); form.context.restoreBusy = false;
  let releaseBody; const pending = form.start(); await form.start();
  assert.equal(form.button.disabled, true); assert.equal(form.button.textContent, 'Préparation…'); assert.equal(form.button['aria-busy'], 'true');
  assert.equal(form.requests.length, 1); assert.equal(form.requests[0].path, '/api/backup'); assert.equal(form.requests[0].options.signal, 30000);
  assert.equal(form.requests[0].options.cache, 'no-store'); assert.equal(form.requests[0].options.headers['X-Manger-Backup'], '1');
  form.reply({ ok: true, blob: () => new Promise(resolve => releaseBody = resolve) }); await Promise.resolve(); await Promise.resolve();
  await form.start(); assert.equal(form.requests.length, 1); assert.equal(form.clicks(), 0);
  const file = new Blob(['SQLite file']); releaseBody(file); await pending;
  assert.equal(form.urls[0], file); assert.equal(form.clicks(), 1); assert.equal(form.appended[0], form.link); assert.equal(form.removed(), 1);
  assert.match(form.link.download, /^manger-\d{4}-\d{2}-\d{2}\.db$/); assert.equal(form.link.href, 'blob:backup');
  assert.match(form.status.textContent, /lancé.*Vérifie/); assert.equal(form.button.disabled, false); assert.equal(form.button['aria-busy'], 'false');
  assert.equal(form.button.textContent, 'Télécharger la sauvegarde complète'); assert.equal(form.timers[0].ms, 60000); form.timers[0].callback(); assert.deepEqual(form.revoked, ['blob:backup']);
});

test('sauvegarde : erreur réseau ou délai pendant les en-têtes et le corps libèrent le bouton sans téléchargement', async () => {
  for (const name of ['TypeError', 'TimeoutError', 'AbortError']) for (const body of [false, true]) {
    const form = download(), pending = form.start(), error = Object.assign(new Error('Erreur technique'), { name });
    if (body) form.reply({ ok: true, blob: async () => { throw error; } }); else form.fail(error);
    await pending; assert.match(form.status.textContent, /connexion.*foyer sont inchangées/); assert.equal(form.button.disabled, false);
    assert.equal(form.urls.length, 0); assert.equal(form.clicks(), 0); assert.equal(form.requests.length, 1); assert.equal(form.timers.length, 0);
  }
});

test('sauvegarde : refus HTTP avec ou sans JSON explique l’échec sans fabriquer un fichier', async () => {
  for (const json of [async () => ({ error: 'Sauvegarde déjà en cours.' }), async () => { throw new SyntaxError('JSON'); }, async () => ({ error: {} })]) {
    const form = download(), pending = form.start(); form.reply({ ok: false, json }); await pending;
    assert.match(form.status.textContent, /Sauvegarde/); assert.doesNotMatch(form.status.textContent, /\[object Object\]|JSON/);
    assert.equal(form.button.disabled, false); assert.equal(form.clicks(), 0); assert.equal(form.urls.length, 0);
  }
});

test('sauvegarde : fichier vide refusé, nouvelle tentative uniquement sur demande explicite', async () => {
  const form = download(), pending = form.start(); form.reply({ ok: true, blob: async () => new Blob([]) }); await pending;
  assert.match(form.status.textContent, /vide.*Aucun fichier/); assert.equal(form.urls.length, 0); assert.equal(form.requests.length, 1);
  const retry = form.start(); form.reply({ ok: true, blob: async () => new Blob(['SQLite file']) }); await retry;
  assert.equal(form.requests.length, 2); assert.equal(form.clicks(), 1); assert.match(form.status.textContent, /Téléchargement lancé/);
});

test('sauvegarde : clic de téléchargement refusé nettoie le lien et programme la libération du fichier', async () => {
  const form = download(); form.context.clickFails = true;
  const pending = form.start(); form.reply({ ok: true, blob: async () => new Blob(['SQLite file']) }); await pending;
  assert.match(form.status.textContent, /refusé/); assert.equal(form.removed(), 1); assert.equal(form.timers.length, 1);
  form.timers[0].callback(); assert.deepEqual(form.revoked, ['blob:backup']); assert.equal(form.button.disabled, false);
});
