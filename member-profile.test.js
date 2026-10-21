const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script, createContext } = require('node:vm');

function profileForm(fetch) {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.slice(html.indexOf('    function setMemberBusy('), html.indexOf('    async function saveProtein('));
  const fields = new Map();
  let submit;
  const element = id => {
    if (!fields.has(id)) fields.set(id, { value: '', textContent: '', focus() {}, addEventListener(type, handler) { this[type] = handler; } });
    return fields.get(id);
  };
  element('member-name').value = 'Camille'; element('member-diet').value = 'pescetarian';
  element('member-avoided').value = 'tomate crue';
  const context = createContext({
    document: { getElementById(id) { return id === 'member-form' ? { addEventListener(type, handler) { submit = handler; } } : element(id); }, querySelector: () => element('direct-remove') },
    memberBusy: false, restoreBusy: false, proteinBusy: false, memberStep: 0, editingMemberId: null, state: { members: [{ id: 7, name: 'Camille' }] },
    fetch, AbortSignal,
    confirm: () => context.accept, accept: true,
    renderMemberStep() {}, addMemberTaste() {},
    memberError(message) { element('member-error').textContent = message; },
    memberTastes: () => ['tomate crue'],
    memberDialog: { closed: false, close() { this.closed = true; }, setAttribute(name, value) { this[name] = value; } },
    householdDialog: { showModal() {} },
    clearMemberEditor() { element('member-name').value = ''; context.memberStep = 0; },
    renderHousehold() {},
    load: async () => true,
  });
  new Script(source).runInContext(context);
  const removeFromList = () => element('member-list').click({ target: { closest: selector => selector === '[data-remove-member]' ? { dataset: { removeMember: '7' } } : null } });
  return { context, element, submit: () => submit({ preventDefault() {}, submitter: {} }), remove: () => element('delete-member').click(), removeFromList };
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

test('profil : refus HTTP sans détail conserve la saisie, lecture remplacée distingue la sauvegarde confirmée', async () => {
  const form = profileForm(async () => ({ ok: false, json: async () => { throw new SyntaxError('JSON'); } }));
  form.context.memberStep = 2; await form.submit();
  assert.match(form.element('member-error').textContent, /saisie est conservée/); assert.doesNotMatch(form.element('member-error').textContent, /Impossible de confirmer/);
  assert.equal(form.element('member-name').value, 'Camille');
  form.context.fetch = async () => ({ ok: true }); form.context.load = async () => false; await form.submit();
  assert.match(form.element('member-status').textContent, /enregistré.*sans recréer/); assert.equal(form.context.memberDialog.closed, true);
});

test('retrait du profil : annulation, double appui, blocage du foyer et réponse perdue expliquée sans modifier la saisie', async () => {
  let reject, requests = 0, options;
  const form = profileForm((path, received) => { requests++; assert.equal(path, '/api/members/7'); options = received; return new Promise((resolve, no) => reject = no); });
  form.context.editingMemberId = 7; form.context.accept = false; await form.remove(); assert.equal(requests, 0);
  form.context.accept = true; const pending = form.remove(); await form.remove(); await form.submit();
  assert.equal(requests, 1); assert.equal(options.method, 'DELETE'); assert.ok(options.signal instanceof AbortSignal);
  for (const id of ['member-fields', 'member-back', 'close-member', 'new-member', 'close-household']) assert.equal(form.element(id).disabled, true);
  for (const id of ['member-list', 'protein-list']) assert.equal(form.element(id).inert, true);
  assert.equal(form.context.memberDialog['aria-busy'], 'true');
  reject(new TypeError('fetch failed')); await pending;
  assert.match(form.element('member-error').textContent, /Impossible de confirmer le retrait.*vérifie/); assert.equal(form.element('member-name').value, 'Camille');
  assert.equal(form.context.memberDialog.closed, false); assert.equal(form.element('new-member').disabled, false); assert.equal(form.element('protein-list').inert, false);
});

test('retrait du profil : refus illisible puis confirmation et lecture échouée sans renvoi', async () => {
  let requests = 0;
  const form = profileForm(async () => { requests++; return { ok: false, json: async () => { throw new SyntaxError('JSON'); } }; });
  form.context.editingMemberId = 7; await form.remove(); assert.match(form.element('member-error').textContent, /retrait a été refusé/);
  assert.equal(form.context.memberDialog.closed, false);
  form.context.fetch = async () => { requests++; return { ok: true }; }; form.context.load = async () => { throw new Error('Lecture échouée'); }; await form.remove();
  assert.equal(requests, 2); assert.equal(form.context.memberDialog.closed, true); assert.match(form.element('member-status').textContent, /retirée.*sans refaire/);
  assert.equal(form.context.memberBusy, false);
});

test('un profil ne peut pas être remplacé pendant son enregistrement, les protéines ou une restauration', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.match(/^    function openMemberEditor[\s\S]*?(?=\n    function closeMemberEditor)/m)[0];
  const context = createContext({ restoreBusy: false, memberBusy: true, proteinBusy: false, clearMemberEditor() { throw new Error('Ne pas remplacer le brouillon en cours'); } });
  const open = new Script(source + ';openMemberEditor').runInContext(context); open();
  context.memberBusy = false; context.proteinBusy = true; open();
  context.proteinBusy = false; context.restoreBusy = true; open();
});

test('le retrait direct demande confirmation et bloque doublons, protéines et restauration', async () => {
  let requests = 0, release;
  const form = profileForm((path, options) => {
    requests++; assert.equal(path, '/api/members/7'); assert.equal(options.method, 'DELETE');
    return new Promise(resolve => release = resolve);
  });
  form.context.accept = false; await form.removeFromList(); assert.equal(requests, 0);
  form.context.accept = true;
  for (const busy of ['restoreBusy', 'proteinBusy']) {
    form.context[busy] = true; await form.removeFromList(); assert.equal(requests, 0); form.context[busy] = false;
  }
  const removing = form.removeFromList(); await form.removeFromList();
  assert.equal(requests, 1); assert.equal(form.element('member-list').inert, true);
  assert.equal(form.element('close-household').disabled, true);
  release({ ok: true }); await removing;
  assert.equal(form.context.state.members.length, 0);
  assert.match(form.element('member-status').textContent, /retirée/);
  assert.equal(form.context.memberDialog.closed, false);
  assert.equal(form.context.memberBusy, false);
});

test('retrait direct : réponse perdue conserve la personne, confirmation retire la ligne malgré une lecture échouée', async () => {
  let requests = 0;
  const form = profileForm(async () => { requests++; throw new TypeError('Réseau'); });
  await form.removeFromList();
  assert.equal(form.context.state.members.length, 1);
  assert.match(form.element('member-status').textContent, /Impossible de confirmer le retrait/);
  assert.equal(form.context.memberBusy, false);
  form.context.fetch = async () => { requests++; return { ok: true }; };
  form.context.load = async () => false;
  await form.removeFromList();
  assert.equal(form.context.state.members.length, 0);
  assert.match(form.element('member-status').textContent, /retirée.*sans refaire/);
  await form.removeFromList(); assert.equal(requests, 2);
});
