const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

function editor() {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.match(/^    async function saveProtein[\s\S]*?(?=\n    document.getElementById\('protein-form'\))/m)[0];
  const nodes = new Map(), calls = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false, hidden: true, reportValidity: () => true, textContent: '', setAttribute(name, value) { this[name] = value; }, focus() { this.focused = true; } });
    return nodes.get(id);
  };
  const values = { 'protein-name': 'Tofu fumé', 'protein-category': 'plant', 'protein-amount': '120', 'protein-unit': 'g' };
  Object.entries(values).forEach(([id, value]) => node(id).value = value);
  node('save-protein').textContent = 'Ajouter la protéine'; node('delete-protein').textContent = 'Retirer cette protéine';
  let resolve, reject, reloads = 0, cleared = 0, confirmations = 0;
  const context = { proteinBusy: false, memberBusy: false, editingProteinId: null, state: { proteins: [{ id: 7, name: 'tofu fumé' }] }, AbortSignal,
    householdDialog: { open: true }, document: { getElementById: node },
    confirm: () => { confirmations++; return context.accept; }, accept: true,
    fetch(path, options) { calls.push({ path, options }); return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    load: async () => { reloads++; if (context.refreshError) throw new Error('Lecture échouée'); return context.refreshResult; }, refreshResult: true,
    clearProteinEditor() { cleared++; context.editingProteinId = null; node('protein-name').value = ''; node('save-protein').textContent = 'Ajouter la protéine'; },
    showHouseholdError(error) { node('household-error').textContent = error.error; node('household-error').hidden = false; }
  };
  const save = new Script(source + ';saveProtein').runInNewContext(context);
  return { node, context, calls, values, save, reply: response => resolve(response), fail: error => reject(error), reloads: () => reloads, cleared: () => cleared, confirmations: () => confirmations };
}

test('protéines : validité native, verrouillage, double envoi et ajout confirmé sans lire la réponse JSON', async () => {
  const form = editor();
  form.node('protein-form').reportValidity = () => false; await form.save(); assert.equal(form.calls.length, 0);
  form.node('protein-form').reportValidity = () => true;
  const pending = form.save(); await form.save(); await form.save(true);
  assert.equal(form.calls.length, 1); assert.equal(form.confirmations(), 0);
  assert.equal(form.context.proteinBusy, true);
  assert.equal(form.node('protein-fields').disabled, true);
  for (const id of ['member-list', 'protein-list']) assert.equal(form.node(id).inert, true);
  for (const id of ['close-household', 'new-member']) assert.equal(form.node(id).disabled, true);
  assert.equal(form.node('protein-form')['aria-busy'], 'true');
  assert.deepEqual(JSON.parse(form.calls[0].options.body), { name: 'Tofu fumé', category: 'plant', amount: 120, unit: 'g' });
  assert.equal(form.calls[0].options.method, 'POST'); assert.ok(form.calls[0].options.signal instanceof AbortSignal);
  form.reply({ ok: true, json: async () => { throw new Error('Ne pas relire une création confirmée'); } }); await pending;
  assert.equal(form.cleared(), 1); assert.equal(form.reloads(), 1);
  assert.equal(form.node('protein-status').textContent, 'Protéine ajoutée.');
  assert.equal(form.context.proteinBusy, false); assert.equal(form.node('protein-fields').disabled, false);
  assert.equal(form.node('protein-list').inert, false); assert.equal(form.node('new-member').disabled, false);
  assert.equal(form.node('protein-form')['aria-busy'], 'false');
  assert.equal(form.node('protein-name').focused, true);
});

test('protéines : refus et réseau conservent la saisie, actualisation échouée ne rejoue pas la modification', async () => {
  for (const mode of ['server', 'network', 'timeout', 'refresh', 'superseded']) {
    const form = editor(); form.context.editingProteinId = 7;
    form.node('save-protein').textContent = 'Enregistrer la protéine';
    form.context.refreshError = mode === 'refresh'; form.context.refreshResult = mode !== 'superseded';
    const pending = form.save();
    if (mode === 'network') form.fail(new TypeError('fetch failed'));
    else if (mode === 'timeout') form.fail({ name: 'TimeoutError' });
    else form.reply({ ok: mode !== 'server', json: async () => ({ error: 'Catégorie incompatible.' }) });
    await pending;
    assert.equal(form.calls.length, 1); assert.equal(form.calls[0].path, '/api/proteins/7');
    assert.equal(form.calls[0].options.method, 'PUT');
    assert.equal(form.context.proteinBusy, false);
    assert.equal(form.node('close-household').disabled, false);
    const saved = mode === 'refresh' || mode === 'superseded';
    assert.equal(form.cleared(), saved ? 1 : 0); assert.equal(form.reloads(), saved ? 1 : 0);
    assert.match(form.node('household-error').textContent, saved ? /enregistrée.*sans refaire/ : mode === 'server' ? /Catégorie incompatible/ : /saisie est conservée/);
    if (!saved) {
      for (const [id, value] of Object.entries(form.values)) assert.equal(form.node(id).value, value);
      assert.equal(form.node('save-protein').textContent, 'Enregistrer la protéine');
    } else assert.equal(form.node('save-protein').textContent, 'Ajouter la protéine');
  }
});

test('protéines : retrait confirmé, annulation sans requête et clics protégés pendant une écriture', async () => {
  const form = editor(); await form.save(true); assert.equal(form.calls.length, 0);
  form.context.editingProteinId = 7; form.context.accept = false; await form.save(true); assert.equal(form.calls.length, 0);
  form.context.accept = true;
  const pending = form.save(true); await form.save(true); await form.save();
  assert.equal(form.calls.length, 1); assert.equal(form.calls[0].options.method, 'DELETE');
  assert.equal('body' in form.calls[0].options, false);
  form.reply({ ok: true }); await pending;
  assert.equal(form.node('protein-status').textContent, 'Protéine retirée.');
  assert.equal(form.node('delete-protein').textContent, 'Retirer cette protéine');
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  assert.match(html, /function openMemberEditor\(member\) \{\s+if \(proteinBusy \|\| memberBusy\) return;/);
  assert.match(html, /householdDialog.addEventListener\('cancel', event => \{ if \(proteinBusy \|\| memberBusy\) event.preventDefault\(\); \}\)/);
  form.context.memberBusy = true; await form.save(); await form.save(true); assert.equal(form.calls.length, 1);
});
