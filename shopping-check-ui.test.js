const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

function list() {
  const nodes = new Map(), requests = [], replies = [], failures = [], errors = [], copies = []; let renders = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, style: {}, textContent: '', innerHTML: '', querySelector: () => null, addEventListener(type, listener) { this[type] = listener; } });
    return nodes.get(id);
  };
  const context = { state: { weekStart: '2026-10-12', shopping: [{ name: 'Carottes', unit: 'g', amount: 500, checked: false }, { manualId: 8, name: 'Café', unit: 'paquet', amount: 1, checked: false }] },
    key: date => date, pendingShoppingChecks: new Map(), shoppingSyncVersion: 0, AbortSignal,
    document: { getElementById: node, querySelector: () => null, hidden: false }, organizingShopping: false, shoppingInteraction: false, pendingLoads: 0,
    renderShopping() { renders++; }, shoppingError(error) { errors.push(error.message); }, saveOfflineShopping() { copies.push(JSON.parse(JSON.stringify(context.state.shopping))); },
    fetch(path, options) { requests.push({ path, options }); return new Promise((resolve, reject) => { replies.push(resolve); failures.push(reject); }); },
    shoppingAisle: () => 'Épicerie', shoppingNeighbors: rows => rows,shoppingText: item => item.name, escapeHtml: text => text
  };
  const identity = html.match(/^    function shoppingCheckKey[^\n]+/m)[0];
  const source = html.match(/^    document.getElementById\('shopping'\).addEventListener\('change',[\s\S]*?(?=\n    function shoppingError)/m)[0];
  const ready = html.match(/^    function canSyncShopping[\s\S]*?(?=\n    async function syncShopping)/m)[0];
  new Script(identity + '\n' + source + '\n' + ready + ';globalThis.ready=canSyncShopping;').runInNewContext(context);
  const checkbox = (index, checked = true) => ({ dataset: { shopping: String(index) }, disabled: false, checked, setAttribute(name, value) { this[name] = value; }, closest() { return this; } });
  return { context, node, requests, replies, failures, errors, copies, checkbox, change: input => node('shopping').change({ target: input }), renders: () => renders };
}

test('courses : plusieurs coches possibles, même article verrouillé après nouveau rendu et valeur capturée avant l’envoi', async () => {
  const form = list(), carrot = form.checkbox(0), coffee = form.checkbox(1);
  const first = form.change(carrot); carrot.checked = false; const duplicate = form.checkbox(0); await form.change(duplicate);
  const second = form.change(coffee); assert.equal(form.requests.length, 2); assert.equal(form.context.ready(), false);
  assert.deepEqual(JSON.parse(form.requests[0].options.body), { weekStart: '2026-10-12', name: 'Carottes', unit: 'g', checked: true });
  assert.ok(form.requests[0].options.signal instanceof AbortSignal);
  form.replies[1]({ ok: true }); await second;
  assert.equal(form.context.state.shopping[1].checked, true); assert.equal(form.context.pendingShoppingChecks.size, 1); assert.equal(form.context.ready(), false);
  form.context.state.shopping = JSON.parse(JSON.stringify(form.context.state.shopping)).reverse();
  form.replies[0]({ ok: true }); await first;
  assert.equal(form.context.state.shopping.find(item => item.name === 'Carottes').checked, true);
  assert.equal(form.context.pendingShoppingChecks.size, 0); assert.equal(form.context.ready(), true); assert.equal(form.copies.length, 2);
});

test('courses : réponse d’une autre semaine ignorée, article supprimé non recréé', async () => {
  const form = list(), first = form.change(form.checkbox(0));
  form.context.state.weekStart = '2026-10-19'; form.context.state.shopping = [{ name: 'Carottes', unit: 'g', checked: false }];
  form.replies[0]({ ok: true }); await first;
  assert.equal(form.context.state.shopping[0].checked, false); assert.equal(form.renders(), 0); assert.equal(form.copies.length, 0);
  const second = form.change(form.checkbox(0)); form.context.state.shopping = []; form.replies[1]({ ok: true }); await second;
  assert.equal(form.context.state.shopping.length, 0); assert.equal(form.context.pendingShoppingChecks.size, 0);
});

test('courses : refus illisible distinct d’une réponse perdue, aucun renvoi automatique', async () => {
  const form = list(), refused = form.change(form.checkbox(0));
  form.replies[0]({ ok: false, json: async () => { throw new SyntaxError('JSON'); } }); await refused;
  assert.match(form.errors[0], /coche a été refusée/); assert.equal(form.context.state.shopping[0].checked, false);
  const lost = form.change(form.checkbox(0)); form.failures[1](new TypeError('fetch failed')); await lost;
  assert.match(form.errors[1], /recharge-la.*peut-être reçu/); assert.equal(form.requests.length, 2); assert.equal(form.copies.length, 0);
  assert.equal(form.context.pendingShoppingChecks.size, 0); assert.equal(form.renders(), 2);
  const stale = form.change(form.checkbox(0)); form.context.state.weekStart = '2026-10-19'; form.failures[2](new TypeError('fetch failed')); await stale;
  assert.equal(form.errors.length, 2);
});

test('courses : nouveau rendu conserve les coches et verrous en cours sans bloquer les autres articles', () => {
  const form = list(); form.context.pendingShoppingChecks.set(JSON.stringify(['2026-10-12', null, 'Carottes', 'g']), true);
  const identity = html.match(/^    function shoppingCheckKey[^\n]+/m)[0];
  const render = html.match(/^    function renderShopping[\s\S]*?(?=\n    function renderHousehold)/m)[0];
  new Script(identity + '\n' + render + ';renderShopping();').runInNewContext(form.context);
  assert.match(form.node('shopping').innerHTML, /data-shopping="0" checked disabled aria-busy="true"/);
  assert.match(form.node('shopping').innerHTML, /data-shopping="1"><span>Café/);
  form.context.pendingShoppingChecks.set(JSON.stringify(['2026-10-12', null, 'Carottes', 'g']), false); form.context.state.shopping[0].checked = true;
  new Script(identity + '\n' + render + ';renderShopping();').runInNewContext(form.context);
  assert.match(form.node('shopping').innerHTML, /data-shopping="0" disabled aria-busy="true"/);
});

test('courses : pause de 200 ms en cochant si le mouvement est permis, fête quand la dernière coche est confirmée', async () => {
  const form = list(), renders = [], delays = [];
  form.context.renderShopping = options => renders.push(options || {});
  form.context.matchMedia = () => ({ matches: false });
  form.context.setTimeout = (resolve, ms) => { delays.push(ms); resolve(); };
  const first = form.change(form.checkbox(0)); form.replies[0]({ ok: true }); await first;
  assert.deepEqual(delays, [200]); assert.equal(renders.at(-1).celebrate, false);
  const last = form.change(form.checkbox(1)); form.replies[1]({ ok: true }); await last;
  assert.equal(renders.at(-1).celebrate, true, 'tout est coché');
  const undo = form.change(form.checkbox(1, false)); form.replies[2]({ ok: true }); await undo;
  assert.deepEqual(delays, [200, 200], 'pas de pause en décochant'); assert.equal(renders.at(-1).celebrate, false);
  form.context.matchMedia = () => ({ matches: true });
  const calm = form.change(form.checkbox(1)); form.replies[3]({ ok: true }); await calm;
  assert.deepEqual(delays, [200, 200], 'mouvement réduit : pas de pause'); assert.equal(renders.at(-1).celebrate, true, 'le message reste');
  const refused = form.change(form.checkbox(0, false)); form.replies[4]({ ok: false, json: async () => ({ error: 'Non.' }) }); await refused;
  assert.equal(renders.at(-1).celebrate, false);
});

test('courses : tout coché, mascotte et message ; animation seulement juste après la dernière coche', () => {
  const form = list(); form.context.state.shopping.forEach(item => { item.checked = true; });
  const identity = html.match(/^    function shoppingCheckKey[^\n]+/m)[0];
  const render = html.match(/^    function renderShopping[\s\S]*?(?=\n    function renderHousehold)/m)[0];
  new Script(identity + '\n' + render + ';renderShopping({ celebrate: true });').runInNewContext(form.context);
  assert.match(form.node('shopping').innerHTML, /class="empty-state shopping-done shopping-done-new"/);
  assert.match(form.node('shopping').innerHTML, /<img class="shopping-mascot" src="\/icon.svg" width="72" height="72" alt="">/);
  assert.match(form.node('shopping').innerHTML, /Tout est dans le panier !/);
  new Script(identity + '\n' + render + ';renderShopping();').runInNewContext(form.context);
  assert.match(form.node('shopping').innerHTML, /class="empty-state shopping-done"/);
});
