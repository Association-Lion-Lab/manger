const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

function favorites() {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const source = html.match(/^    async function toggleRecipeFavorite[\s\S]*?(?=\n    document.getElementById\('edit-recipe'\))/m)[0];
  const nodes = new Map(), cards = [1, 1, 2].map(id => ({ recipeId: id, disabled: false })), calls = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, disabled: false, hidden: true, textContent: '', setAttribute(name, value) { this[name] = value; }, addEventListener(type, listener) { this[type] = listener; } });
    return nodes.get(id);
  };
  const context = { state: { recipes: [{ id: 1, favorite: false }, { id: 2, favorite: false }] }, pendingFavorites: new Set(), editingRecipeId: 1, recipeDeleteBusy: false, recipeViewDialog: { open: true }, AbortSignal, uiIcon: require('./public/ui-icons').icon,
    document: { getElementById: node, querySelectorAll: selector => cards.filter(card => selector.includes(`"${card.recipeId}"`)) },
    fetch(path, options) { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); calls.push({ path, options, resolve, reject }); return promise; },
    renderRecipes() { cards.forEach(card => card.disabled = context.pendingFavorites.has(card.recipeId)); }
  };
  const toggle = new Script(source + ';toggleRecipeFavorite').runInNewContext(context);
  return { html, node, context, cards, calls, toggle, click: () => node('favorite-recipe').click({ currentTarget: node('favorite-recipe') }) };
}

test('favoris : les vues du même plat partagent le verrou, une réponse ancienne ne déverrouille pas une autre fiche', async () => {
  const form = favorites(), oldRecipe = form.context.state.recipes[0];
  const first = form.toggle(oldRecipe, form.node('favorite-recipe'));
  await form.toggle(oldRecipe, form.cards[0]); assert.equal(form.calls.length, 1);
  assert.equal(form.cards[0].disabled, true); assert.equal(form.cards[1].disabled, true);
  assert.ok(form.calls[0].options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(form.calls[0].options.body), { favorite: true });
  form.context.editingRecipeId = 2; form.node('favorite-recipe').disabled = false; form.node('favorite-recipe').textContent = 'Deuxième recette';
  const second = form.toggle(form.context.state.recipes[1], form.node('favorite-recipe'));
  form.calls[0].resolve({ ok: true, json: async () => ({ favorite: true }) }); await first;
  assert.equal(form.node('favorite-recipe').disabled, true); assert.equal(form.node('favorite-recipe').textContent, 'Deuxième recette');
  assert.equal(form.cards[0].disabled, false); assert.equal(form.cards[2].disabled, true);
  form.calls[1].resolve({ ok: true, json: async () => ({ favorite: true }) }); await second;
  assert.equal(form.node('favorite-recipe').disabled, false); assert.equal(form.node('favorite-recipe')['aria-pressed'], 'true');
  assert.equal(form.context.pendingFavorites.size, 0);
  assert.match(form.html, /favoriteButton.disabled = pendingFavorites.has\(recipe.id\)/);
});

test('favoris : confirmation applique la recette courante même après un rechargement, retrait explicite conservé', async () => {
  const form = favorites();
  const first = form.click();
  form.context.state.recipes = [{ id: 1, favorite: false }, { id: 2, favorite: false }];
  form.calls[0].resolve({ ok: true, json: async () => ({ favorite: true }) }); await first;
  assert.equal(form.context.state.recipes[0].favorite, true);
  assert.match(form.node('favorite-recipe').innerHTML, /data-ui-name="heart"/);
  assert.match(form.node('favorite-recipe').innerHTML, /Retirer des favoris$/);
  const remove = form.click(); assert.deepEqual(JSON.parse(form.calls[1].options.body), { favorite: false });
  form.calls[1].resolve({ ok: true, json: async () => ({ favorite: false }) }); await remove;
  assert.equal(form.context.state.recipes[0].favorite, false); assert.equal(form.node('favorite-recipe')['aria-pressed'], 'false');
  assert.match(form.node('favorite-recipe').innerHTML, /Ajouter aux favoris$/);
});

test('favoris : un résultat ne réactive pas la fiche pendant une suppression, aucune nouvelle requête du favori', async () => {
  const form = favorites(), pending = form.click(); form.context.recipeDeleteBusy = true;
  form.calls[0].resolve({ ok: true, json: async () => ({ favorite: true }) }); await pending;
  assert.equal(form.node('favorite-recipe').disabled, true);
  await form.toggle(form.context.state.recipes[0], form.cards[0]); assert.equal(form.calls.length, 1);
});

test('favoris : réseau et réponses invalides libèrent les contrôles sans basculer le favori ni renvoyer une requête', async () => {
  for (const mode of ['network', 'json', 'shape', 'refused']) {
    const form = favorites(), pending = form.click();
    if (mode === 'network') form.calls[0].reject(new TypeError('fetch failed'));
    else form.calls[0].resolve({ ok: mode !== 'refused', json: async () => { if (mode === 'json') throw new SyntaxError('HTML'); return mode === 'refused' ? { error: 'Recette inconnue' } : { favorite: 'true' }; } });
    await pending;
    assert.equal(form.calls.length, 1); assert.equal(form.context.state.recipes[0].favorite, false);
    assert.equal(form.node('favorite-recipe').disabled, false); assert.equal(form.node('recipe-view-error').hidden, false);
    assert.equal(form.context.pendingFavorites.size, 0);
  }
});

test('favoris : une erreur tardive ne s’affiche pas sur la nouvelle fiche', async () => {
  const form = favorites(), pending = form.click();
  form.context.editingRecipeId = 2; form.node('favorite-recipe').disabled = false;
  form.calls[0].reject(new TypeError('fetch failed')); await pending;
  assert.equal(form.node('recipe-view-error').hidden, true); assert.equal(form.node('favorite-recipe').disabled, false);
});

test('favoris : le cœur bat une fois quand un favori est ajouté, jamais au retrait, en échec ou en mouvement réduit', async () => {
  const form = favorites(), pops = [], selectors = [], cards = form.context.document.querySelectorAll;
  form.context.document.querySelectorAll = selector => { if (!selector.includes('.ui-icon')) return cards(selector); selectors.push(selector); return [{ animate: (frames, options) => pops.push(options.duration) }]; };
  form.context.matchMedia = () => ({ matches: false });
  const recipe = form.context.state.recipes[0];
  const added = form.toggle(recipe, form.cards[0]); form.calls[0].resolve({ ok: true, json: async () => ({ favorite: true }) }); await added;
  assert.deepEqual(pops, [240]); assert.match(selectors[0], /\[data-favorite-recipe="1"\] \.ui-icon, #favorite-recipe \.ui-icon/);
  const removed = form.toggle(recipe, form.cards[0]); form.calls[1].resolve({ ok: true, json: async () => ({ favorite: false }) }); await removed;
  const failed = form.toggle(recipe, form.cards[0]); form.calls[2].reject(new TypeError('fetch failed')); await failed.catch(() => {});
  form.context.matchMedia = () => ({ matches: true });
  const calm = form.toggle(recipe, form.cards[0]); form.calls[3].resolve({ ok: true, json: async () => ({ favorite: true }) }); await calm;
  assert.deepEqual(pops, [240]);
  form.context.matchMedia = () => ({ matches: false }); // fiche ouverte : plat 1
  const other = form.toggle(form.context.state.recipes[1], form.cards[2]); form.calls[4].resolve({ ok: true, json: async () => ({ favorite: true }) }); await other;
  assert.equal(selectors.at(-1), '[data-favorite-recipe="2"] .ui-icon', 'la fiche ouverte d’un autre plat ne bat pas');
});
