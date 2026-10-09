const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

test('déplacement et restes utilisent la protection commune, sans dépendre du bouton de soumission', async () => {
  const nodes = new Map(), calls = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '', addEventListener(type, listener) { this[type] = listener; } });
    return nodes.get(id);
  };
  const source = html.match(/^    function openPlacement[\s\S]*?(?=\n    let suggestionRequest)/m)[0];
  const context = { document: { getElementById: node, querySelectorAll: () => [] },
    state: { meals: [{ id: 7, date: '2026-10-12', slot: 'soir', title: 'Curry', people: 2, extraPortions: 0, assignments: [] }], members: [], recipes: [], proteins: [] },
    postMeal: async (payload, path) => calls.push({ payload: JSON.parse(JSON.stringify(payload)), path }), key: date => date.toISOString().slice(0, 10)
  };
  const handlers = new Script(source + ';({openPlacement, openLeftovers})').runInNewContext(context);
  handlers.openPlacement(7);
  node('placement-action').value = 'copy'; node('placement-date').value = '2026-10-14'; node('placement-slot').value = 'midi';
  await node('placement-form').submit({ preventDefault() {}, submitter: null });
  assert.deepEqual(calls[0], { path: '/api/meals/7/placement', payload: { action: 'copy', date: '2026-10-14', slot: 'midi', sourceDate: '2026-10-12', sourceSlot: 'soir' } });
  handlers.openLeftovers(7);
  node('leftovers-date').value = '2026-10-13'; node('leftovers-slot').value = 'soir'; node('leftovers-people').value = '3';
  await node('leftovers-form').submit({ preventDefault() {}, submitter: null });
  assert.deepEqual(calls[1], { path: '/api/meals/leftovers', payload: { sourceId: 7, date: '2026-10-13', slot: 'soir', people: 3, dishes: [] } });
});

test('les restes gardent seulement les assiettes cochées et leurs portions', async () => {
  const source = html.match(/^    function openLeftovers[\s\S]*?(?=\n    let suggestionRequest)/m)[0];
  const nodes = new Map(); const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', addEventListener(type, listener) { this[type] = listener; } });
    return nodes.get(id);
  };
  const row = (id, checked, portions) => ({ dataset: { leftoverDish: String(id) }, querySelector: selector => selector.includes('checkbox') ? { checked } : { value: String(portions) } });
  let received;
  const open = new Script(source + ';openLeftovers').runInNewContext({
    document: { getElementById: node, querySelectorAll: () => [row(1, true, 2), row(2, false, 1)] },
    state: { meals: [{ id: 7, date: '2026-10-12', slot: 'soir', title: 'Deux plats', people: 2, dishes: [{ memberId: 1, recipeId: 1 }, { memberId: 2, recipeId: 2 }] }], members: [], recipes: [], proteins: [] },
    key: date => date.toISOString().slice(0, 10), escapeHtml: text => text,
    postMeal: async (payload, path) => { received = { payload: JSON.parse(JSON.stringify(payload)), path }; }
  });
  open(7); node('leftovers-date').value = '2026-10-13'; node('leftovers-slot').value = 'midi';
  await node('leftovers-form').submit({ preventDefault() {}, submitter: null });
  assert.deepEqual(received.payload.dishes, [{ memberId: 1, portions: 2 }]);
  assert.equal(received.path, '/api/meals/leftovers');
});

test('retirer un repas protège la fermeture et les doubles envois, signale les refus et ne rejoue pas une suppression confirmée', async () => {
  const source = html.match(/^    async function postMeal[\s\S]*?(?=\n    function compatibleProteins)/m)[0];
  const nodes = new Map(), requests = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { disabled: false, textContent: '', contains: () => false, setAttribute(name, value) { this[name] = value; } });
    return nodes.get(id);
  };
  let release, closes = 0, loads = 0;
  const save = new Script(source + ';postMeal').runInNewContext({ document: { getElementById: node }, AbortSignal,
    fetch: (path, options) => { requests.push({ path, options }); return new Promise(resolve => { release = resolve; }); },
    dialog: { close() { closes++; } }, load: async () => { loads++; throw new Error('Actualisation échouée'); }
  });
  const path = '/api/meals?date=2026-10-12&slot=soir';
  const pending = save(null, path, 'DELETE'); await save(null, path, 'DELETE');
  assert.equal(requests.length, 1); assert.equal(requests[0].options.method, 'DELETE');
  assert.equal('body' in requests[0].options, false); assert.ok(requests[0].options.signal instanceof AbortSignal);
  assert.equal(node('meal-fields').disabled, true); assert.equal(node('close-dialog').disabled, true);
  assert.equal(node('dialog-subtitle').textContent, 'Retrait en cours…');
  release({ ok: false, json: async () => ({ error: 'Retrait refusé.' }) }); await pending;
  assert.equal(node('dialog-error').textContent, 'Retrait refusé.'); assert.equal(node('dialog-error').hidden, false);
  assert.equal(node('meal-fields').disabled, false); assert.equal(closes, 0);
  const retry = save(null, path, 'DELETE'); release({ ok: true }); await retry;
  assert.equal(requests.length, 2); assert.equal(closes, 1); assert.equal(loads, 1); assert.equal(node('close-dialog').disabled, false);
  assert.match(html, /await postMeal\(null, `\/api\/meals\?date=\$\{date\}&slot=\$\{state.slot\}`, 'DELETE'\)/);
});
