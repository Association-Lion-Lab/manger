const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('./public/menu-composer');

function composer(members = []) {
  const nodes = new Map(), listeners = new Map(), reads = [], writes = [];
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { disabled: false, dataset: {}, textContent: '', hidden: true, value: '', focus() {} });
    return nodes.get(selector);
  };
  const fields = [node('field'), node('close'), node('save')];
  let closes = 0, navigations = 0, reloads = 0, resolveWrite, rejectWrite;
  const state = { members, meals: [], recipes: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, title: `Plat ${i + 1}`, minutes: 15, diet: 'vegan', ingredients: [] })) };
  const dialog = { ownerDocument: {}, open: false, innerHTML: '', setAttribute() {},
    querySelector: node,
    querySelectorAll: selector => selector === 'button, input, select' ? fields : [],
    addEventListener(type, listener) { listeners.set(type, listener); },
    showModal() { this.open = true; },
    close() { this.open = false; closes++; listeners.get('close')?.(); }
  };
  const control = { state, dialog, reads, writes, fields, node, readError: null, reloadError: null, afterReload: null };
  const menu = create({ dialog, state: () => state, escape: value => String(value), icon: () => '', cover: () => '', notice: () => '',
    candidates: () => state.recipes, search: (list, query) => list.filter(recipe => recipe.title.includes(query)),
    async api(path, options) {
      reads.push({ path, options });
      if (control.readError) throw control.readError;
      return JSON.parse(options.body).slots.map((slot, index) => ({ ...slot, recipeId: slot.recipeId || index + 1 }));
    },
    fetch(path, options) { writes.push({ path, options }); return new Promise((resolve, reject) => { resolveWrite = resolve; rejectWrite = reject; }); },
    async reload() { reloads++; if (control.reloadError) throw control.reloadError; control.afterReload?.(); return true; },
    courses() { navigations++; }
  });
  Object.assign(control, {
    open: () => menu.open('2026-11-02'),
    click: (action, extra = {}) => listeners.get('click')({ target: { closest: () => ({ disabled: false, dataset: { menuAction: action, ...extra } }) } }),
    reply: response => resolveWrite(response), fail: error => rejectWrite(error),
    counts: () => ({ closes, navigations, reloads })
  });
  return control;
}

test('menu guidé : cinq recettes, validation sans écriture et ajout au-delà de cinq', async () => {
  const form = composer(); await form.open();
  assert.equal(JSON.parse(form.reads[0].options.body).slots.length, 5);
  assert.ok(form.reads[0].options.signal instanceof AbortSignal);
  await form.click('add'); assert.match(form.dialog.innerHTML, /Ajouter une recette/);
  await form.click('pick', { menuRecipe: '8' });
  const preview = JSON.parse(form.reads[1].options.body);
  assert.equal(preview.slots.length, 6); assert.equal(preview.slots[5].recipeId, 8);
  assert.deepEqual(preview.slots.slice(0, 5).map(slot => slot.recipeId), [1, 2, 3, 4, 5]);
  assert.match(form.dialog.innerHTML, /6 recettes/);
  await form.click('replace', { menuIndex: '1' });
  await form.click('pick', { menuRecipe: '7' });
  assert.deepEqual(JSON.parse(form.reads[2].options.body).slots.map(slot => slot.recipeId), [1, 7, 3, 4, 5, 8]);
  await form.click('days'); assert.match(form.dialog.innerHTML, /Les jours de ton menu/);
  assert.equal(form.writes.length, 0);
  await form.click('back'); assert.match(form.dialog.innerHTML, /6 recettes/);
});

test('menu guidé : double appui bloqué, participants conservés, refus sans fermeture', async () => {
  const form = composer([{ id: 7, name: 'A', diet: 'vegan' }, { id: 8, name: 'B', diet: 'omnivore' }]);
  await form.open(); await form.click('days');
  const pending = form.click('save'); await form.click('save');
  assert.equal(form.writes.length, 1); assert.ok(form.fields.every(field => field.disabled));
  const payload = JSON.parse(form.writes[0].options.body);
  assert.equal(form.writes[0].path, '/api/week/plan');
  assert.ok(form.writes[0].options.signal instanceof AbortSignal);
  assert.deepEqual(payload.meals[0].dishes, [{ memberId: 7, recipeId: 1, portions: 1 }, { memberId: 8, recipeId: 1, portions: 1 }]);
  form.reply({ ok: false, status: 400, json: async () => ({ error: 'Créneau déjà occupé.' }) }); await pending;
  assert.match(form.dialog.innerHTML, /Créneau déjà occupé/);
  assert.equal(form.counts().closes, 0); assert.equal(form.counts().reloads, 0);
  assert.ok(form.fields.every(field => !field.disabled));
});

test('menu guidé : succès puis relecture échouée, reprise en lecture seule sans renvoi', async () => {
  const form = composer(); await form.open(); await form.click('days');
  form.reloadError = new Error('Courses indisponibles');
  const pending = form.click('save');
  form.reply({ ok: true, json: async () => { throw new Error('Ne pas lire une écriture confirmée'); } }); await pending;
  assert.match(form.dialog.innerHTML, /Courses indisponibles/);
  assert.match(form.dialog.innerHTML, /Afficher les courses/);
  await form.click('save'); assert.equal(form.writes.length, 1);
  await form.click('close'); await form.open();
  assert.match(form.dialog.innerHTML, /Afficher les courses/);
  assert.equal(form.reads.length, 1);
  form.reloadError = null; await form.click('refresh');
  assert.equal(form.writes.length, 1); assert.equal(form.counts().navigations, 1);
});

test('menu guidé : confirmation perdue, vérification du planning sans second envoi', async () => {
  const form = composer(); await form.open(); await form.click('days');
  const pending = form.click('save'); form.fail(new TypeError('fetch failed')); await pending;
  assert.match(form.dialog.innerHTML, /Confirmation perdue/);
  assert.doesNotMatch(form.dialog.innerHTML, /Aucun changement avant la création des courses/);
  await form.click('save'); assert.equal(form.writes.length, 1);
  form.afterReload = () => { form.state.meals = JSON.parse(form.writes[0].options.body).meals; };
  await form.click('check');
  assert.equal(form.writes.length, 1); assert.equal(form.counts().navigations, 1);
});

test('menu guidé : échec du recalcul conserve les plats et débloque les contrôles', async () => {
  const form = composer(); await form.open(); await form.click('replace', { menuIndex: '0' });
  const failure = new Error('Délai dépassé'); failure.name = 'TimeoutError'; form.readError = failure;
  await form.click('pick', { menuRecipe: '8' });
  assert.match(form.dialog.innerHTML, /Ton menu est conservé/);
  assert.ok(form.fields.every(field => !field.disabled));
  await form.click('back'); assert.match(form.dialog.innerHTML, /Plat 1/);
  assert.equal(form.writes.length, 0);
});
