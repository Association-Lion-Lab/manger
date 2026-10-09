const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

function movement() {
  const nodes = new Map(), requests = [], errors = []; let release, reject, reads = 0, animations = 0;
  const node = id => { if (!nodes.has(id)) nodes.set(id, { disabled: false, inert: false, focus() {} }); return nodes.get(id); };
  const item = { manualId: 7, name: 'Café', unit: 'paquet', aisle: 'Épicerie' };
  const context = { shoppingEditBusy: false, state: { weekStart: '2026-10-12', shopping: [item] }, key: date => date, AbortSignal,
    document: { getElementById: node, querySelector: () => ({ parentElement: { animate() { animations++; } } }) },
    fetch(path, options) { requests.push({ path, options }); return new Promise((yes, no) => { release = yes; reject = no; }); },
    load: async () => { reads++; return context.readResult; }, readResult: true,
    matchMedia: () => ({ matches: context.reduced }), reduced: false, shoppingMoveDialog: { close() {} }, shoppingError: error => errors.push(error.message)
  };
  const source = html.match(/^    async function moveShoppingItem[\s\S]*?(?=\n    document.getElementById\('shopping'\).addEventListener\('click')/m)[0];
  const move = new Script(source + ';moveShoppingItem').runInNewContext(context);
  return { context, item, node, move, requests, errors, reply: response => release(response), fail: error => reject(error), reads: () => reads, animations: () => animations };
}

test('déplacement de rayon : requête unique, attente bornée, liste débloquée et animation conservée', async () => {
  const form = movement(); await form.move(null, 'Maison'); assert.equal(form.requests.length, 0);
  const pending = form.move(form.item, 'Maison'); await form.move(form.item, 'Frais');
  assert.equal(form.requests.length, 1); assert.equal(form.node('shopping').inert, true); assert.equal(form.node('organize-shopping').disabled, true);
  assert.ok(form.requests[0].options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(form.requests[0].options.body), { weekStart: '2026-10-12', name: 'Café', unit: 'paquet', manualId: 7, aisle: 'Maison' });
  form.reply({ ok: true }); await pending;
  assert.equal(form.reads(), 1); assert.equal(form.animations(), 1); assert.equal(form.context.shoppingEditBusy, false); assert.equal(form.node('shopping').inert, false);
  form.context.reduced = true; const reduced = form.move(form.item, ''); form.reply({ ok: true }); await reduced; assert.equal(form.animations(), 1);
});

test('déplacement de rayon : refus lisible, réponse perdue et relecture remplacée sans renvoi', async () => {
  const form = movement(), refused = form.move(form.item, 'Frais');
  form.reply({ ok: false, json: async () => { throw new SyntaxError('JSON'); } }); await refused;
  assert.match(form.errors[0], /déplacement a été refusé/); assert.equal(form.reads(), 0); assert.equal(form.node('shopping').inert, false);
  const lost = form.move(form.item, 'Frais'); form.fail(new TypeError('fetch failed')); await lost;
  assert.match(form.errors[1], /serveur a peut-être reçu/); assert.equal(form.reads(), 0);
  form.context.readResult = false; const saved = form.move(form.item, 'Frais'); form.reply({ ok: true }); await saved;
  assert.match(form.errors[2], /rayon est enregistré.*sans refaire/); assert.equal(form.requests.length, 3); assert.equal(form.reads(), 1); assert.equal(form.node('organize-shopping').disabled, false);
});

test('déplacement de rayon : ancienne semaine ignorée après confirmation', async () => {
  const form = movement(), pending = form.move(form.item, 'Frais'); form.context.state.weekStart = '2026-10-19'; form.reply({ ok: true }); await pending;
  assert.equal(form.reads(), 0); assert.equal(form.animations(), 0); assert.equal(form.errors.length, 0); assert.equal(form.node('shopping').inert, false);
});
