const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script, createContext } = require('node:vm');

function profileForm(fetch) {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.slice(html.indexOf("    document.getElementById('member-form').addEventListener"), html.indexOf("    document.getElementById('member-list').addEventListener"));
  const fields = new Map();
  let submit;
  const element = id => {
    if (!fields.has(id)) fields.set(id, { value: '', textContent: '', focus() {} });
    return fields.get(id);
  };
  element('member-name').value = 'Camille'; element('member-diet').value = 'pescetarian';
  element('member-avoided').value = 'tomate crue';
  const context = createContext({
    document: { getElementById(id) { return id === 'member-form' ? { addEventListener(type, handler) { submit = handler; } } : element(id); } },
    memberBusy: false, memberStep: 0, editingMemberId: null,
    fetch, AbortSignal,
    renderMemberStep() {}, addMemberTaste() {},
    memberError(message) { element('member-error').textContent = message; },
    memberTastes: () => ['tomate crue'],
    setMemberBusy(value) { context.memberBusy = value; element('member-fields').disabled = value; },
    memberDialog: { closed: false, close() { this.closed = true; } },
    householdDialog: { showModal() {} },
    clearMemberEditor() { element('member-name').value = ''; context.memberStep = 0; },
    load: async () => {},
  });
  new Script(source).runInContext(context);
  return { context, element, submit: () => submit({ preventDefault() {}, submitter: {} }) };
}

test('le profil ne s’enregistre qu’après le récapitulatif, un double appui ne double pas la création', async () => {
  let writes = 0, release, input;
  const form = profileForm((path, options) => { writes++; input = JSON.parse(options.body); return new Promise(resolve => { release = resolve; }); });
  await form.submit(); assert.equal(form.context.memberStep, 1); assert.equal(writes, 0);
  await form.submit(); assert.equal(form.context.memberStep, 2); assert.equal(writes, 0);
  const saving = form.submit(); await form.submit();
  assert.equal(writes, 1); assert.equal(form.element('member-fields').disabled, true);
  assert.deepEqual(input, { name: 'Camille', diet: 'pescetarian', avoidedIngredients: ['tomate crue'] });
  release({ ok: true }); await saving;
  assert.equal(form.context.memberDialog.closed, true);
  assert.equal(form.context.memberBusy, false);
});

test('un échec conserve le brouillon, une actualisation échouée ne rejoue pas un profil confirmé', async () => {
  const failed = profileForm(async () => ({ ok: false, json: async () => ({ error: 'Profil refusé' }) }));
  failed.context.memberStep = 2; await failed.submit();
  assert.equal(failed.element('member-name').value, 'Camille');
  assert.equal(failed.element('member-error').textContent, 'Profil refusé');
  assert.equal(failed.context.memberDialog.closed, false);
  assert.equal(failed.context.memberBusy, false);
  let writes = 0;
  const confirmed = profileForm(async () => { writes++; return { ok: true }; });
  confirmed.context.memberStep = 2; confirmed.context.load = async () => { throw new Error('Réseau'); };
  await confirmed.submit();
  assert.equal(writes, 1); assert.equal(confirmed.context.memberDialog.closed, true);
  assert.match(confirmed.element('member-status').textContent, /Profil enregistré/);
});

test('un nouveau profil ne garde pas les champs cachés du précédent', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.slice(html.indexOf('    function clearMemberEditor()'), html.indexOf('    function clearProteinEditor()'));
  const fields = new Map([['member-form', { reset() {} }], ['member-diet', { value: 'pescetarian' }], ['member-avoided', { value: 'tomate crue' }], ['delete-member', {}], ['household-error', {}]]);
  const context = createContext({ document: { getElementById: id => fields.get(id) }, memberError() {}, editingMemberId: 3, memberStep: 2 });
  new Script(source + '\nclearMemberEditor();').runInContext(context);
  assert.equal(fields.get('member-diet').value, 'omnivore');
  assert.equal(fields.get('member-avoided').value, '');
  assert.equal(context.editingMemberId, null);
  assert.equal(context.memberStep, 0);
});
