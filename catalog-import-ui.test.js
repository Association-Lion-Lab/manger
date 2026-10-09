const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

function catalog() {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.match(/^    document.getElementById\('import-catalog'\)[\s\S]*?(?=\n    document.getElementById\('recipes-panel'\))/m)[0];
  const button = { disabled: false, textContent: 'Ajouter le catalogue', setAttribute(name, value) { this[name] = value; }, addEventListener(type, listener) { this[type] = listener; } }, status = {}, calls = [];
  let resolve, reject, loads = 0;
  const context = { document: { getElementById: id => id === 'import-catalog' ? button : status }, AbortSignal,
    fetch(path, options) { calls.push({ path, options }); return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    load: async () => { loads++; if (context.failedLoad) throw new Error('Lecture échouée'); return true; }
  };
  new Script(source).runInNewContext(context);
  return { button, status, calls, context, loads: () => loads, click: () => button.click({ currentTarget: button }), reply: response => resolve(response), fail: error => reject(error) };
}

test('catalogue : double appui ignoré, confirmation séparée du rechargement et bouton restauré', async () => {
  const form = catalog(), pending = form.click(); await form.click();
  assert.equal(form.calls.length, 1); assert.equal(form.button.disabled, true); assert.equal(form.button['aria-busy'], 'true');
  assert.equal(form.calls[0].path, '/api/catalog/import'); assert.equal(form.calls[0].options.method, 'POST'); assert.ok(form.calls[0].options.signal instanceof AbortSignal);
  form.reply({ ok: true, json: async () => ({ added: 8 }) }); await pending;
  assert.equal(form.loads(), 1); assert.match(form.status.textContent, /^8 nouvelles recettes/); assert.equal(form.button.disabled, false);
  assert.equal(form.button.textContent, 'Ajouter le catalogue'); assert.equal(form.button['aria-busy'], 'false');
});

test('catalogue : réponse illisible après confirmation et lecture échouée ne relancent jamais l’import', async () => {
  const form = catalog(); form.context.failedLoad = true;
  const pending = form.click(); form.reply({ ok: true, json: async () => { throw new SyntaxError('HTML'); } }); await pending;
  assert.equal(form.calls.length, 1); assert.equal(form.loads(), 1); assert.match(form.status.textContent, /Catalogue importé.*sans refaire/);
  assert.equal(form.button.disabled, false);
  form.context.failedLoad = false;
  const next = form.click(); form.reply({ ok: true, json: async () => ({ added: 0 }) }); await next;
  assert.match(form.status.textContent, /^0 nouvelles recettes/);
});

test('catalogue : refus et réponse perdue expliqués sans relecture ni renvoi automatique', async () => {
  for (const failure of ['network', 'timeout', 'server']) {
    const form = catalog(), pending = form.click();
    if (failure === 'network') form.fail(new TypeError('fetch failed'));
    else if (failure === 'timeout') form.fail({ name: 'TimeoutError' });
    else form.reply({ ok: false, json: async () => ({ error: 'Catalogue indisponible.' }) });
    await pending;
    assert.equal(form.calls.length, 1); assert.equal(form.loads(), 0); assert.equal(form.button.disabled, false);
    assert.match(form.status.textContent, failure === 'server' ? /Catalogue indisponible/ : /peut-être été ajoutés/);
  }
});
