const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

function importer() {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.match(/^    const recipeImportDialog[\s\S]*?(?=\n    document.getElementById\('export-recipes'\))/m)[0];
  const nodes = new Map(), calls = [], timers = new Map(), edits = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { disabled: false, hidden: true, value: '', innerHTML: '', textContent: '', open: false,
      addEventListener(type, listener) { this[type] = listener; }, setAttribute(name, value) { this[name] = value; },
      replaceChildren() { this.innerHTML = ''; }, showModal() { this.open = true; }, close() { this.open = false; this.onClose(); }
    });
    return nodes.get(id);
  };
  node('recipe-import-dialog').addEventListener = (type, listener) => { node('recipe-import-dialog')[type === 'close' ? 'onClose' : type] = listener; };
  const context = { document: { getElementById: node }, AbortController, DOMException,
    setTimeout(callback, delay) { const id = {}; timers.set(id, { callback, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    fetch(path, options) { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); calls.push({ path, options, resolve, reject }); return promise; },
    escapeHtml: text => String(text).replaceAll('<', '&lt;'), openRecipeEditor: (recipe, imported) => edits.push({ recipe, imported })
  };
  const preview = new Script(source + ';previewImport').runInNewContext(context);
  const open = () => node('import-recipes').click(); open();
  return { node, calls, timers, edits, open, preview, close: () => node('recipe-import-dialog').close(),
    result: title => ({ ok: true, json: async () => ({ recipes: [{ title, ingredients: [{ name: 'riz', unit: 'g', amount: 100 }] }], warnings: ['À vérifier'] }) }) };
}

test('import : double lancement ignoré, lien gelé pendant la recherche, timeout borné et aucune écriture avant relecture', async () => {
  const form = importer(); form.node('recipe-import-url').value = 'https://example.org/riz';
  const pending = form.preview({ kind: 'url', url: form.node('recipe-import-url').value });
  await form.preview({ kind: 'url', url: 'https://example.org/autre' });
  assert.equal(form.calls.length, 1);
  assert.equal(form.node('recipe-import-url').disabled, true); assert.equal(form.node('recipe-import-file').disabled, true);
  assert.equal(form.node('recipe-import-dialog')['aria-busy'], 'true');
  assert.equal([...form.timers.values()][0].delay, 20000);
  assert.equal(form.calls[0].path, '/api/recipes/import-preview');
  form.calls[0].resolve(form.result('Mon riz')); await pending;
  assert.equal(form.node('recipe-import-url').disabled, false); assert.equal(form.timers.size, 0);
  assert.match(form.node('recipe-import-result').innerHTML, /Mon riz/); assert.equal(form.edits.length, 0);
  form.node('recipe-import-select').value = '0';
  form.node('recipe-import-result').click({ target: { closest: () => true } });
  assert.equal(form.edits.length, 1); assert.equal(form.edits[0].imported, true);
  assert.equal(form.edits[0].recipe.id, null); assert.equal(form.node('recipe-import-dialog').open, false);
  assert.equal(form.calls.length, 1);
});

test('import : fermer libère immédiatement les contrôles, une ancienne réponse ne remplace ni résultat ni verrou du nouvel import', async () => {
  const form = importer();
  const first = form.preview({ kind: 'url', url: 'https://example.org/premier' });
  form.close(); assert.equal(form.calls[0].options.signal.aborted, true); assert.equal(form.timers.size, 0);
  assert.equal(form.node('preview-recipe-url').disabled, false);
  form.open(); const second = form.preview({ kind: 'url', url: 'https://example.org/second' });
  form.calls[0].resolve(form.result('Ancien résultat')); await first;
  assert.equal(form.node('preview-recipe-url').disabled, true); assert.equal(form.node('recipe-import-result').innerHTML, '');
  form.calls[1].resolve(form.result('Résultat actuel')); await second;
  assert.match(form.node('recipe-import-result').innerHTML, /Résultat actuel/);
  assert.doesNotMatch(form.node('recipe-import-result').innerHTML, /Ancien résultat/);
  assert.equal(form.node('preview-recipe-url').disabled, false);
});

test('import : fichier limité et JSON valide, lecture abandonnée sans requête, brouillon URL conservé en erreur', async () => {
  const form = importer();
  await form.preview({ kind: 'file', file: { size: 1000001, text() { throw new Error('Ne pas lire'); } } });
  assert.match(form.node('recipe-import-error').textContent, /trop volumineux/); assert.equal(form.calls.length, 0);
  await form.preview({ kind: 'file', file: { size: 12, text: async () => '{cassé' } });
  assert.equal(form.node('recipe-import-error').textContent, 'Fichier JSON invalide'); assert.equal(form.calls.length, 0);
  let finish;
  const pending = form.preview({ kind: 'file', file: { size: 12, text: () => new Promise(resolve => { finish = resolve; }) } });
  form.close(); form.open(); finish('{"format":"manger-recipes"}'); await pending;
  assert.equal(form.calls.length, 0); assert.equal(form.node('preview-recipe-url').disabled, false);
  form.node('recipe-import-url').value = 'https://example.org/riz';
  const failed = form.preview({ kind: 'url', url: form.node('recipe-import-url').value });
  form.calls[0].reject(new TypeError('fetch failed')); await failed;
  assert.equal(form.node('recipe-import-url').value, 'https://example.org/riz');
  assert.match(form.node('recipe-import-error').textContent, /Aucun import enregistré/);
  assert.equal(form.node('recipe-import-url').disabled, false);
});

test('import : délai et réponse illisible rendent le formulaire disponible sans import automatique', async () => {
  const form = importer();
  const pending = form.preview({ kind: 'url', url: 'https://example.org/riz' });
  const timer = [...form.timers.values()][0]; timer.callback();
  form.calls[0].reject(form.calls[0].options.signal.reason); await pending;
  assert.match(form.node('recipe-import-error').textContent, /dépassé le délai/);
  assert.equal(form.node('preview-recipe-url').disabled, false);
  for (const mode of ['json', 'shape', 'refusal']) {
    const current = form.preview({ kind: 'url', url: 'https://example.org/riz' });
    form.calls.at(-1).resolve({ ok: mode !== 'refusal', json: async () => { if (mode === 'json') throw new SyntaxError('HTML'); return mode === 'refusal' ? { error: 'Lien privé interdit' } : {}; } });
    await current; assert.equal(form.node('recipe-import-error').hidden, false); assert.equal(form.node('preview-recipe-url').disabled, false);
  }
  assert.equal(form.edits.length, 0); assert.equal(form.timers.size, 0);
});
