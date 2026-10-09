const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

function notesForm() {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.match(/^    document.getElementById\('recipe-notes-form'\)[\s\S]*?(?=\n    const cookingDialog)/m)[0];
  const elements = new Map(), calls = [];
  const node = id => {
    if (!elements.has(id)) elements.set(id, { disabled: false, value: '', textContent: '', setAttribute(name, value) { this[name] = value; }, addEventListener(name, listener) { this[name] = listener; }, focus() { this.focused = true; } });
    return elements.get(id);
  };
  node('recipe-rating').value = '4'; node('recipe-note').value = ' Ajouter du citron. ';
  node('dialog').open = true;
  node('start-cooking').disabled = true;
  let resolve, reject, timeout;
  const context = { editingRecipeId: 1, state: { recipes: [{ id: 1, rating: 0, note: 'Ancienne note' }] }, document: { getElementById: node }, recipeViewDialog: node('dialog'),
    AbortSignal: { timeout(milliseconds) { timeout = milliseconds; return 'signal'; } },
    fetch(path, options) { calls.push({ path, options }); return new Promise((yes, no) => { resolve = yes; reject = no; }); }
  };
  new Script(source).runInNewContext(context);
  return { node, calls, context, submit: () => node('recipe-notes-form').submit({ preventDefault() {}, submitter: null }),
    reply: response => resolve(response), fail: error => reject(error), timeout: () => timeout };
}

test('notes : Entrée sans bouton, double envoi, fermeture bloquée et confirmation canonique', async () => {
  const form = notesForm();
  const pending = form.submit();
  assert.equal(form.node('recipe-notes-fields').disabled, true);
  assert.equal(form.node('recipe-notes-form')['aria-busy'], 'true');
  for (const id of ['close-recipe-view', 'plan-recipe', 'start-cooking', 'edit-recipe', 'duplicate-recipe', 'delete-recipe', 'recipe-view-portions']) assert.equal(form.node(id).disabled, true);
  let prevented = false;
  form.node('dialog').cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await form.submit(); assert.equal(form.calls.length, 1);
  assert.equal(form.timeout(), 15000);
  assert.equal(form.calls[0].path, '/api/recipes/1/notes');
  assert.equal(form.calls[0].options.method, 'PUT');
  assert.equal(form.calls[0].options.signal, 'signal');
  assert.deepEqual(JSON.parse(form.calls[0].options.body), { rating: 4, note: ' Ajouter du citron. ' });
  form.reply({ ok: true, json: async () => ({ rating: 4, note: 'Ajouter du citron.' }) }); await pending;
  assert.equal(form.context.state.recipes[0].note, 'Ajouter du citron.');
  assert.equal(form.node('recipe-note').value, 'Ajouter du citron.');
  assert.equal(form.node('recipe-notes-status').textContent, 'Notes enregistrées.');
  assert.equal(form.node('recipe-notes-fields').disabled, false);
  assert.equal(form.node('recipe-notes-form')['aria-busy'], 'false');
  assert.equal(form.node('close-recipe-view').disabled, false);
  assert.equal(form.node('start-cooking').disabled, true); // Preserve a previously unavailable action.
  assert.equal(form.node('save-recipe-notes').focused, true);
  prevented = false; form.node('dialog').cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
});

test('notes : refus, réponse perdue ou illisible conservent le brouillon et ne rejouent rien', async () => {
  for (const failure of ['refused', 'network', 'timeout', 'json', 'shape']) {
    const form = notesForm(), pending = form.submit();
    if (failure === 'network' || failure === 'timeout') form.fail(new Error(failure));
    else form.reply({ ok: failure !== 'refused', json: async () => {
      if (failure === 'json') throw new SyntaxError('Invalid JSON');
      return failure === 'refused' ? { error: 'Commentaire trop long.' } : { note: 'Pas de note numérique' };
    } });
    await pending;
    assert.equal(form.calls.length, 1);
    assert.equal(form.node('recipe-note').value, ' Ajouter du citron. ');
    assert.equal(form.node('recipe-rating').value, '4');
    assert.equal(form.context.state.recipes[0].note, 'Ancienne note');
    assert.equal(form.node('recipe-notes-fields').disabled, false);
    assert.equal(form.node('close-recipe-view').disabled, false);
    assert.equal(form.node('save-recipe-notes').textContent, 'Enregistrer mes notes');
    assert.match(form.node('recipe-notes-status').textContent, failure === 'refused' ? /Commentaire trop long/ : /saisie est conservée/);
  }
});

test('notes : une confirmation tardive ne modifie pas une autre fiche', async () => {
  const form = notesForm(), pending = form.submit();
  form.context.editingRecipeId = 2;
  form.node('recipe-note').value = 'Autre recette';
  form.node('recipe-notes-status').textContent = 'Autre fiche';
  form.reply({ ok: true, json: async () => ({ rating: 4, note: 'Ajouter du citron.' }) }); await pending;
  assert.equal(form.context.state.recipes[0].note, 'Ajouter du citron.');
  assert.equal(form.node('recipe-note').value, 'Autre recette');
  assert.equal(form.node('recipe-notes-status').textContent, 'Autre fiche');
  assert.equal(form.node('save-recipe-notes').focused, undefined);
});
