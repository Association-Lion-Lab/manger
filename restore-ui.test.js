const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

function restoration() {
  const nodes = new Map(), requests = []; let resolve, reject, reloads = 0, closes = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { disabled: false, inert: false, isConnected: true, textContent: '',
      setAttribute(name, value) { this[name] = value; }, addEventListener(type, listener) { this[type] = listener; },
      focus() { this.focused = true; }, replaceChildren() { this.textContent = ''; } });
    return nodes.get(id);
  };
  const controls = ['restore-file', 'preview-restore', 'close-household', 'new-member', 'save-protein', 'download-backup', 'confirm-restore'].map(node);
  node('restore-file').files = [{ name: 'snapshot.db', size: 128 }]; node('preview-restore').textContent = 'Vérifier le fichier';
  node('save-protein').disabled = true; node('member-list').inert = true;
  const dialog = node('household-dialog'); dialog.open = true; dialog.querySelectorAll = () => controls;
  dialog.close = () => { closes++; dialog.open = false; };
  const context = { document: { getElementById: node }, proteinBusy: false, memberBusy: false, householdDialog: dialog,
    AbortSignal: { timeout: value => value }, confirm: () => context.accept, accept: true,
    fetch(path, options) { requests.push({ path, options }); return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    location: { reload() { reloads++; if (context.failReload) throw new Error('Reload'); } } };
  const source = html.match(/^    let restoreToken[\s\S]*?(?=\n    document.getElementById\('download-backup'\))/m)[0];
  const guards = html.match(/^    document.getElementById\('close-household'\)[\s\S]*?(?=\n    const memberDialog)/m)[0];
  new Script(source + '\n' + guards + '\nthis.apply = applyRestore; this.busy = () => restoreBusy; this.token = () => restoreToken;').runInNewContext(context);
  return { context, node, requests, controls, preview: () => node('restore-form').submit({ preventDefault() {} }),
    apply: () => context.apply(), reply: response => resolve(response), fail: error => reject(error), reloads: () => reloads, closes: () => closes };
}

async function previewReady(form) {
  const pending = form.preview();
  form.reply({ ok: true, json: async () => ({ token: 'private-preview', recipes: 3, members: 2, meals: 4 }) });
  await pending;
}

test('restauration : aperçu sans submitter, envoi unique, fermeture et champs protégés', async () => {
  const form = restoration(), pending = form.preview(); await form.preview();
  assert.equal(form.requests.length, 1); assert.equal(form.requests[0].options.signal, 30000);
  assert.equal(form.requests[0].options.headers['X-Manger-Restore'], '1'); assert.equal(form.requests[0].options.body, form.node('restore-file').files[0]);
  form.controls.forEach(control => assert.equal(control.disabled, true)); assert.equal(form.node('household-dialog')['aria-busy'], 'true');
  form.node('close-household').click(); assert.equal(form.closes(), 0);
  let prevented = 0; form.node('household-dialog').cancel({ preventDefault() { prevented++; } });
  form.node('household-dialog').click({ preventDefault() { prevented++; } }); assert.equal(prevented, 2);
  form.node('restore-file').change(); assert.match(form.node('restore-preview').textContent, /Vérification/);
  form.reply({ ok: true, json: async () => ({ token: 'preview', recipes: 3, members: 2, meals: 4 }) }); await pending;
  assert.equal(form.context.token(), 'preview'); assert.match(form.node('restore-preview').innerHTML, /3 recettes · 2 personnes · 4 repas/);
  assert.equal(form.node('restore-file').disabled, false); assert.equal(form.node('preview-restore').focused, true);
  assert.equal(form.node('save-protein').disabled, true); assert.equal(form.node('download-backup').disabled, false); assert.equal(form.node('member-list').inert, true); assert.equal(form.node('protein-list').inert, false);
  form.node('restore-file').change(); assert.equal(form.context.token(), null); form.node('close-household').click(); assert.equal(form.closes(), 1);
});

test('restauration : fichier absent, vide ou trop grand refusé sans requête', async () => {
  for (const file of [undefined, { size: 0 }, { size: 32 * 1024 * 1024 + 1 }]) {
    const form = restoration(); form.node('restore-file').files = file ? [file] : [];
    await form.preview(); assert.equal(form.requests.length, 0); assert.equal(form.context.busy(), false);
    assert.match(form.node('restore-preview').textContent, /non vide.*32 Mo/); assert.equal(form.node('restore-file').disabled, false);
  }
});

test('restauration : aperçu illisible ou refus sans JSON ne fournit aucun jeton', async () => {
  for (const response of [
    { ok: true, json: async () => ({ token: 'preview', recipes: '<img>', members: 2, meals: 4 }) },
    { ok: true, json: async () => { throw new SyntaxError('JSON'); } },
    { ok: false, json: async () => { throw new SyntaxError('JSON'); } }
  ]) {
    const form = restoration(), pending = form.preview(); form.reply(response); await pending;
    assert.equal(form.context.token(), null); assert.equal(form.context.busy(), false); assert.equal(form.node('restore-file').files[0].name, 'snapshot.db');
    assert.match(form.node('restore-preview').textContent, /illisible|pas pu être terminée|refusée/); await form.apply(); assert.equal(form.requests.length, 1);
  }
});

test('restauration : délai d’aperçu libère les contrôles et ne déclenche pas de remplacement', async () => {
  const form = restoration(), pending = form.preview(); form.fail(Object.assign(new Error('Timeout'), { name: 'TimeoutError' })); await pending;
  assert.match(form.node('restore-preview').textContent, /foyer n’a pas été remplacé/);
  assert.equal(form.node('restore-file').disabled, false); assert.equal(form.context.busy(), false); assert.equal(form.reloads(), 0);
  for (const busy of ['proteinBusy', 'memberBusy']) { form.context[busy] = true; await form.preview(); form.context[busy] = false; }
  form.node('download-backup').disabled = true; await form.preview();
  assert.equal(form.requests.length, 1);
});

test('restauration : annulation sans effet, confirmation unique et réussite HTTP sans relire le JSON', async () => {
  const form = restoration(); await previewReady(form); form.node('download-backup').disabled = true; await form.apply();
  assert.equal(form.requests.length, 1); form.node('download-backup').disabled = false;
  form.context.accept = false; await form.apply();
  assert.equal(form.requests.length, 1); assert.equal(form.context.token(), 'private-preview');
  form.context.accept = true; const pending = form.apply(); await form.apply(); await form.preview();
  assert.equal(form.requests.length, 2); assert.equal(form.requests[1].path, '/api/restore/apply');
  assert.equal(form.requests[1].options.body, JSON.stringify({ token: 'private-preview' })); assert.equal(form.requests[1].options.signal, 30000);
  form.reply({ ok: true, json: async () => { throw new Error('Ne pas relire une réussite confirmée'); } }); await pending;
  assert.equal(form.reloads(), 1); assert.equal(form.context.token(), null); assert.equal(form.context.busy(), true);
  assert.match(form.node('restore-preview').textContent, /Foyer restauré/); await form.apply(); assert.equal(form.requests.length, 2);
});

test('restauration : refus et réponse perdue exigent une nouvelle vérification, sans renvoi', async () => {
  for (const error of [new TypeError('Réseau'), Object.assign(new Error('Timeout'), { name: 'TimeoutError' }), null]) {
    const form = restoration(); await previewReady(form); const pending = form.apply();
    if (error) form.fail(error); else form.reply({ ok: false, json: async () => ({ error: 'Aperçu expiré. Vérifie à nouveau le fichier.' }) });
    await pending; assert.equal(form.context.token(), null); assert.equal(form.context.busy(), false); assert.equal(form.reloads(), 0);
    assert.match(form.node('restore-preview').textContent, error ? /Recharge la page.*peut-être terminé/ : /Aperçu expiré/);
    assert.equal(form.node('restore-file').disabled, false); assert.equal(form.node('restore-file').files[0].name, 'snapshot.db');
    await form.apply(); assert.equal(form.requests.length, 2);
  }
});

test('restauration : rechargement échoué après réussite ne permet pas de rejouer le remplacement', async () => {
  const form = restoration(); await previewReady(form); form.context.failReload = true;
  const pending = form.apply(); form.reply({ ok: true }); await pending;
  assert.match(form.node('restore-preview').textContent, /Foyer restauré.*sans refaire/);
  assert.equal(form.context.busy(), true); await form.preview(); await form.apply(); assert.equal(form.requests.length, 2);
});
