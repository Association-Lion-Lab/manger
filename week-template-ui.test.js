const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

function templates() {
  const source = html.match(/^      async function writeTemplate[\s\S]*?(?=\n      document.getElementById\('template-form'\))/m)[0];
  const nodes = new Map(), calls = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false, hidden: true, textContent: '', reportValidity: () => true, setAttribute(name, value) { this[name] = value; }, focus() { this.focused = true; } });
    return nodes.get(id);
  };
  node('template-name').value = 'Semaine rapide';
  let resolve, reject, refreshes = 0;
  const context = { targetStart: '2026-10-12', document: { getElementById: node }, list: { isConnected: true }, dialog: { open: true }, AbortSignal,
    confirm: () => context.accept, accept: true,
    fetch(path, options) { calls.push({ path, options }); return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    refresh: async () => { refreshes++; if (context.refreshError) throw new Error('Lecture échouée'); },
    showError(error) { node('dialog-error').textContent = error.message; node('dialog-error').hidden = false; }
  };
  const write = new Script(source + ';writeTemplate').runInNewContext(context);
  return { node, context, calls, write, reply: response => resolve(response), fail: error => reject(error), refreshes: () => refreshes };
}

test('semaines types : création native protégée et brouillon conservé après refus', async () => {
  const form = templates(); form.node('template-form').reportValidity = () => false; await form.write(); assert.equal(form.calls.length, 0);
  form.node('template-form').reportValidity = () => true;
  const pending = form.write(); await form.write();
  assert.equal(form.calls.length, 1); assert.equal(form.node('meal-fields').disabled, true); assert.equal(form.node('close-dialog').disabled, true);
  assert.equal(form.node('meal-fields')['aria-busy'], 'true');
  assert.deepEqual(JSON.parse(form.calls[0].options.body), { name: 'Semaine rapide', start: '2026-10-12' });
  assert.ok(form.calls[0].options.signal instanceof AbortSignal);
  form.reply({ ok: false, json: async () => ({ error: 'Nom déjà utilisé.' }) }); await pending;
  assert.equal(form.node('template-name').value, 'Semaine rapide'); assert.equal(form.node('meal-fields').disabled, false);
  assert.equal(form.node('dialog-error').textContent, 'Nom déjà utilisé.'); assert.equal(form.refreshes(), 0);
});

test('semaines types : perte réseau conserve le nom, échec de relecture après confirmation ne renvoie pas la création', async () => {
  const form = templates(); const failed = form.write(); form.fail(new TypeError('fetch failed')); await failed;
  assert.equal(form.node('template-name').value, 'Semaine rapide'); assert.match(form.node('dialog-error').textContent, /saisie est conservée/);
  form.context.refreshError = true;
  const saved = form.write(); form.reply({ ok: true, json: async () => { throw new Error('Ne pas relire la création confirmée'); } }); await saved;
  assert.equal(form.calls.length, 2); assert.equal(form.refreshes(), 1); assert.equal(form.node('template-name').value, '');
  assert.equal(form.node('dialog-subtitle').textContent, 'Semaine type enregistrée.');
  assert.match(form.node('dialog-error').textContent, /enregistrée.*sans refaire/);
  assert.equal(form.node('close-dialog').disabled, false);
});

test('semaines types : retrait confirmé sans toucher au nom saisi et applications confiées à la protection du planning', async () => {
  const form = templates(), button = { dataset: { templateDelete: '7', templateName: 'Semaine rapide' } };
  form.context.accept = false; await form.write(button); assert.equal(form.calls.length, 0);
  form.context.accept = true; const pending = form.write(button); await form.write();
  assert.equal(form.calls.length, 1); assert.equal(form.calls[0].options.method, 'DELETE'); assert.equal('body' in form.calls[0].options, false);
  form.reply({ ok: true }); await pending;
  assert.equal(form.node('template-name').value, 'Semaine rapide'); assert.equal(form.node('dialog-subtitle').textContent, 'Semaine type supprimée.');
  assert.match(html, /postMeal\(\{ sourceStart, targetStart, sourceSnapshot: JSON.stringify\(source\) \}, '\/api\/week\/copy'\)/);
  assert.match(html, /await postMeal\(\{ targetStart \}, `\/api\/week-templates\/\$\{use.dataset.templateUse\}\/apply`\)/);
});
