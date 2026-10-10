const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

function deletion() {
  const nodes = new Map(), requests = []; let resolve, reject, reads = 0, renders = 0, closes = 0, timeout;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { disabled: false, hidden: true, textContent: '', value: '', setAttribute(name, value) { this[name] = value; }, addEventListener(type, listener) { this[type] = listener; }, focus() { this.focused = true; } });
    return nodes.get(id);
  };
  const controls = ['delete-recipe', 'favorite-recipe', 'close-recipe-view', 'plan-recipe', 'start-cooking', 'edit-recipe', 'duplicate-recipe', 'recipe-notes-fields', 'recipe-note', 'save-offline-recipe'].map(node);
  node('delete-recipe').textContent = 'Supprimer cette recette'; node('start-cooking').disabled = true; node('recipe-note').value = 'Ma note à conserver';
  const dialog = node('dialog'); dialog.open = true; dialog.querySelectorAll = () => controls; dialog.close = () => { closes++; dialog.open = false; };
  const context = { editingRecipeId: 1, recipeDeleteBusy: false, state: { recipes: [{ id: 1, title: 'Curry' }, { id: 2, title: 'Riz' }] }, pendingFavorites: new Set(),
    document: { getElementById: node }, recipeViewDialog: dialog, confirm: () => context.accept, accept: true,
    AbortSignal: { timeout(value) { timeout = value; return 'signal'; } },
    fetch(path, options) { requests.push({ path, options }); return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    renderRecipes() { renders++; }, load: async () => { reads++; throw new Error('Lecture échouée'); }
  };
  const source = html.match(/^    document.getElementById\('delete-recipe'\).addEventListener[\s\S]*?(?=\n    document.getElementById\('close-recipe-dialog'\))/m)[0];
  const cancel = html.match(/^    recipeViewDialog.addEventListener\('cancel'[^\n]+/m)[0];
  const close = html.match(/^    document.getElementById\('close-recipe-view'\).addEventListener[^\n]+/m)[0];
  new Script(source + '\n' + cancel + '\n' + close).runInNewContext(context);
  return { context, node, requests, controls, remove: () => node('delete-recipe').click(), reply: response => resolve(response), fail: error => reject(error), reads: () => reads, renders: () => renders, closes: () => closes, timeout: () => timeout };
}

test('suppression de recette : confirmation, verrou commun, double envoi et Escape protégés, refus conserve la fiche', async () => {
  const form = deletion(); form.context.accept = false; await form.remove(); assert.equal(form.requests.length, 0);
  form.context.accept = true; form.node('recipe-notes-fields').disabled = true; await form.remove(); assert.equal(form.requests.length, 0); form.node('recipe-notes-fields').disabled = false;
  const pending = form.remove(); await form.remove(); form.node('close-recipe-view').click(); assert.equal(form.closes(), 0);
  let prevented = false; form.node('dialog').cancel({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  assert.equal(form.requests.length, 1); assert.equal(form.requests[0].path, '/api/recipes/1'); assert.equal(form.requests[0].options.method, 'DELETE'); assert.equal(form.timeout(), 15000);
  assert.equal(form.node('dialog')['aria-busy'], 'true'); assert.equal(form.node('delete-recipe').textContent, 'Suppression…'); form.controls.forEach(control => assert.equal(control.disabled, true));
  form.reply({ ok: false, json: async () => ({ error: 'Cette recette est utilisée dans le planning' }) }); await pending;
  assert.match(form.node('recipe-view-error').textContent, /utilisée dans le planning/); assert.equal(form.context.state.recipes.length, 2); assert.equal(form.closes(), 0);
  assert.equal(form.node('recipe-note').value, 'Ma note à conserver'); assert.equal(form.node('start-cooking').disabled, true); assert.equal(form.node('delete-recipe').disabled, false); assert.equal(form.node('delete-recipe').focused, true);
});

test('suppression de recette : réseau incertain et refus illisible ne perdent ni notes ni recette', async () => {
  const form = deletion(), pending = form.remove(); form.fail(new TypeError('fetch failed')); await pending;
  assert.match(form.node('recipe-view-error').textContent, /recharge les recettes.*peut-être reçu/); assert.equal(form.context.state.recipes.length, 2); assert.equal(form.node('recipe-note').value, 'Ma note à conserver');
  const retry = form.remove(); form.reply({ ok: false, json: async () => { throw new SyntaxError('JSON'); } }); await retry;
  assert.match(form.node('recipe-view-error').textContent, /suppression a été refusée/); assert.equal(form.requests.length, 2); assert.equal(form.reads(), 0); assert.equal(form.context.recipeDeleteBusy, false);
});

test('suppression de recette : confirmation sans corps, catalogue local actualisé même si la relecture échoue', async () => {
  const form = deletion(), pending = form.remove(); form.reply({ ok: true, json: async () => { throw new Error('Ne pas relire la suppression confirmée'); } }); await pending;
  assert.equal(form.requests.length, 1); assert.equal(form.closes(), 1); assert.equal(form.reads(), 1); assert.equal(form.renders(), 1); assert.equal(form.context.editingRecipeId, null);
  assert.deepEqual(form.context.state.recipes.map(item => item.id), [2]); assert.equal(form.node('dialog')['aria-busy'], 'false');
  await form.remove(); assert.equal(form.requests.length, 1);
});

test('suppression de recette : favori terminé pendant l’attente ne laisse pas son bouton verrouillé après refus', async () => {
  const form = deletion(); form.context.pendingFavorites.add(1); form.node('favorite-recipe').disabled = true;
  const pending = form.remove(); form.context.pendingFavorites.delete(1); form.reply({ ok: false, json: async () => ({ error: 'Refus' }) }); await pending;
  assert.equal(form.node('favorite-recipe').disabled, false);
  const source = html.match(/^    function openRecipe[\s\S]*?(?=\n    document.getElementById\('plan-recipe'\))/m)[0];
  form.context.recipeDeleteBusy = true;
  const open = new Script(source + ';openRecipe').runInNewContext(form.context); open({ id: 2 }); assert.equal(form.context.editingRecipeId, 1);
});
