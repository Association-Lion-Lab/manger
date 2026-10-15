const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

function composer(members = []) {
  const nodes = new Map(), requests = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { disabled: false, hidden: true, isConnected: true, value: '', textContent: '', contains: () => false,
      setAttribute(name, value) { this[name] = value; }, addEventListener(type, listener) { this[type] = listener; } });
    return nodes.get(id);
  };
  node('compose-minutes').value = '30'; node('compose-people').value = '3';
  node('recipe-0').value = '2'; node('recipe-1').value = '1';
  let resolve, reject, closes = 0, loads = 0;
  const context = { document: { getElementById: node,
    querySelector: selector => node(`recipe-${selector.match(/"(\d+)"/)[1]}`),
    querySelectorAll: selector => selector.includes('member') ? members.map(member => ({ dataset: { composeMember: String(member.id) } })) : [{ dataset: { composeDay: '0' }, value: 'soir' }] },
    state: { weekStart: new Date('2026-10-12T12:00:00Z'), members, recipes: [{ id: 1, title: 'Riz', minutes: 15, diet: 'vegan', ingredients: [] }, { id: 2, title: 'Carottes', minutes: 20, diet: 'vegan', ingredients: [] }] },
    choices: [{ day: 0, slot: 'soir', recipeId: 1 }, { day: 2, slot: 'midi', recipeId: 2 }], members, people: members.length || 3,
    key: date => date.toISOString().slice(0, 10), dateAt: day => new Date(Date.UTC(2026, 9, 12 + day)), AbortSignal,
    fetch(path, options) { requests.push({ path, options }); return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    dialog: { open: true, close() { closes++; this.open = false; } }, load: async () => { loads++; if (context.readError) throw new Error('Relecture impossible'); },
    recipeTaste: () => ({}), tasteRank: () => 0, menuPreviewVersion: 0
  };
  const shared = html.match(/^    async function postMeal[\s\S]*?(?=\n    function compatibleProteins)/m)[0];
  const confirm = html.match(/^      document.getElementById\('confirm-week'\).addEventListener[\s\S]*?(?=\n      document.getElementById\('confirm-week'\).insertAdjacentHTML)/m)[0];
  new Script(shared + '\n' + confirm).runInNewContext(context);
  return { context, node, requests, save: node('confirm-week').click, reply: response => resolve(response), fail: error => reject(error), closes: () => closes, loads: () => loads };
}

test('menu automatique : choix corrigés et participants conservés, double appui bloqué puis refus visible', async () => {
  const form = composer([{ id: 7, diet: 'vegetarian' }, { id: 8, diet: 'omnivore' }]);
  form.node('confirm-week').disabled = true; await form.save(); assert.equal(form.requests.length, 0); form.node('confirm-week').disabled = false;
  const pending = form.save(); await form.save();
  assert.equal(form.requests.length, 1); assert.equal(form.node('meal-fields').disabled, true); assert.equal(form.node('close-dialog').disabled, true);
  assert.equal(form.requests[0].path, '/api/week/plan'); assert.ok(form.requests[0].options.signal instanceof AbortSignal);
  const payload = JSON.parse(form.requests[0].options.body);
  assert.equal(payload.start, '2026-10-12'); assert.deepEqual(payload.meals.map(meal => [meal.date, meal.slot, meal.title, meal.recipeId]), [['2026-10-12', 'soir', 'Carottes', null], ['2026-10-14', 'midi', 'Riz', null]]);
  assert.deepEqual(payload.meals[0].dishes, [{ memberId: 7, recipeId: 2, portions: 1 }, { memberId: 8, recipeId: 2, portions: 1 }]);
  form.reply({ ok: false, json: async () => ({ error: 'Créneau déjà occupé.' }) }); await pending;
  assert.equal(form.node('dialog-error').textContent, 'Créneau déjà occupé.'); assert.equal(form.node('recipe-0').value, '2');
  assert.equal(form.node('meal-fields').disabled, false); assert.equal(form.closes(), 0); assert.equal(form.loads(), 0);
});

test('menu automatique : sans profils, réponse perdue puis confirmation avec relecture échouée sans renvoi', async () => {
  const form = composer(); const lost = form.save(); form.fail(new TypeError('fetch failed')); await lost;
  assert.match(form.node('dialog-error').textContent, /choix sont conservés.*peut-être abouti/);
  form.context.readError = true; const saved = form.save();
  const payload = JSON.parse(form.requests[1].options.body); assert.equal(payload.meals[0].recipeId, 2); assert.equal(payload.meals[0].people, 3); assert.deepEqual(payload.meals[0].dishes, []);
  form.reply({ ok: true, json: async () => { throw new Error('Ne pas lire une écriture confirmée'); } }); await saved;
  assert.equal(form.requests.length, 2); assert.equal(form.closes(), 1); assert.equal(form.loads(), 1); assert.equal(form.node('close-dialog').disabled, false);
});

test('menu automatique : aperçu bloqué pendant la sauvegarde et délai de lecture sans enregistrement', async () => {
  const form = composer();
  const source = html.match(/^    async function previewWeek[\s\S]*?(?=\n    function recipePicker)/m)[0];
  const preview = new Script(source + ';previewWeek').runInNewContext(form.context);
  form.node('meal-fields').disabled = true; await preview(); assert.equal(form.requests.length, 0); form.node('meal-fields').disabled = false;
  const pending = preview(); await preview(); assert.equal(form.requests.length, 1); assert.equal(form.requests[0].path, '/api/week/preview');
  assert.ok(form.requests[0].options.signal instanceof AbortSignal);
  const error = new Error('Timeout'); error.name = 'TimeoutError'; form.fail(error); await pending;
  assert.match(form.node('compose-preview').textContent, /aucun repas n’a été enregistré/); assert.equal(form.node('preview-week').disabled, false);
  assert.equal(form.closes(), 0); assert.equal(form.loads(), 0);
});

test('menu automatique : échec de recalcul conserve le menu et réactive les contrôles', async () => {
  const form = composer(), select = form.node('recipe-0'), button = form.node('preview-week'), status = form.node('compose-update-status');
  select.value = '2'; select.dataset = { composeRecipe: '0' };
  const source = html.match(/^      output.querySelectorAll\('\[data-compose-recipe\]'\).forEach[\s\S]*?(?=\n      updateNotices\(\);)/m)[0];
  let options;
  Object.assign(form.context, { version: 0, button, manualChoices: new Map(), updateNotices() { throw new Error('Ne pas changer le menu après échec'); },
    output: { isConnected: true, querySelector: () => status, querySelectorAll: selector => selector === 'select, button' ? [select, form.node('confirm-week')] : [select] },
    api: async (path, received) => { options = received; throw new Error('Lecture indisponible'); }
  });
  new Script(source).runInNewContext(form.context); await select.change();
  assert.ok(options.signal instanceof AbortSignal); assert.equal(select.value, 1); assert.equal(form.context.manualChoices.size, 0);
  assert.match(status.textContent, /menu précédent est conservé/); assert.equal(button.disabled, false); assert.equal(form.node('confirm-week').disabled, false);
  select.disabled = true; options = null; await select.change(); assert.equal(options, null);
});
