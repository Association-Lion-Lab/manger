const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { create } = require('./public/menu-composer');

function composer(members = [], today = '2026-11-02') {
  const nodes = new Map(), listeners = new Map(), reads = [], writes = [], weeks = [];
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
  const control = { state, dialog, reads, writes, weeks, fields, node, today, readError: null, reloadError: null, afterReload: null, delays: [], pause: null, reduced: false, answer: null };
  const menu = create({ dialog, state: () => state, escape: value => String(value), icon: () => '', cover: () => '', notice: () => '',
    candidates: () => state.recipes, search: (list, query) => list.filter(recipe => recipe.title.includes(query)),
    async api(path, options) {
      reads.push({ path, options });
      if (control.readError) throw control.readError;
      if (control.answer) return control.answer(JSON.parse(options.body));
      return JSON.parse(options.body).slots.map((slot, index) => ({ ...slot, recipeId: slot.recipeId || index + 1 }));
    },
    fetch(path, options) { writes.push({ path, options }); return new Promise((resolve, reject) => { resolveWrite = resolve; rejectWrite = reject; }); },
    async reload() { reloads++; if (control.reloadError) throw control.reloadError; control.afterReload?.(); return true; },
    courses() { navigations++; }, today: () => control.today,
    async week(start) { weeks.push(start); state.meals = []; return true; },
    reducedMotion: () => control.reduced,
    delay: ms => { control.delays.push(ms); return control.pause || Promise.resolve(); }
  });
  Object.assign(control, {
    open: (start = '2026-11-02') => menu.open(start),
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

test('menu guidé : un dimanche, aucun jour passé proposé ni sélectionnable', async () => {
  const form = composer([], '2026-11-15'); await form.open('2026-11-09');
  assert.deepEqual(JSON.parse(form.reads[0].options.body).slots, [{ day: 6, slot: 'soir' }, { day: 6, slot: 'midi' }]);
  await form.click('days');
  assert.match(form.dialog.innerHTML, /dimanche 15 nov/);
  assert.doesNotMatch(form.dialog.innerHTML, /lundi 9 nov|samedi 14 nov/);
});

test('menu guidé : semaine sans repas libre à venir, la suivante est proposée sans rien écrire', async () => {
  const form = composer([], '2026-11-15');
  form.state.meals = [{ date: '2026-11-15', slot: 'midi' }, { date: '2026-11-15', slot: 'soir' }];
  await form.open('2026-11-09');
  assert.equal(form.reads.length, 0);
  assert.match(form.dialog.innerHTML, /Plus de repas libre à venir/);
  assert.match(form.dialog.innerHTML, /data-menu-action="next"/);
  await form.click('next');
  assert.deepEqual(form.weeks, ['2026-11-16']);
  const preview = JSON.parse(form.reads[0].options.body);
  assert.equal(preview.start, '2026-11-16'); assert.equal(preview.slots.length, 5);
  assert.equal(form.writes.length, 0);
});

test('menu guidé : brouillon rouvert plus tard, les plats des jours passés glissent vers un repas libre à venir', async () => {
  const form = composer([], '2026-11-09'); await form.open('2026-11-09');
  await form.click('close'); form.today = '2026-11-12'; await form.open('2026-11-09');
  assert.equal(form.reads.length, 1);
  await form.click('days');
  assert.equal(form.dialog.innerHTML.match(/ selected/g).length, 10);
  const pending = form.click('save');
  assert.equal(form.writes.length, 1, form.dialog.innerHTML.match(/role="alert"[^<]*>[^<]*/)?.[0]);
  const dates = JSON.parse(form.writes[0].options.body).meals.map(meal => meal.date + '/' + meal.slot).sort();
  assert.deepEqual(dates, ['2026-11-12/midi', '2026-11-12/soir', '2026-11-13/soir', '2026-11-14/soir', '2026-11-15/soir']);
  form.reply({ ok: true, json: async () => ({}) }); await pending;
});

test('menu guidé : première proposition mise en scène, 900 ms minimum même si le serveur répond avant', async () => {
  const form = composer(); let release; form.pause = new Promise(resolve => { release = resolve; });
  const opening = form.open();
  await new Promise(setImmediate);
  assert.equal(form.reads.length, 1); assert.deepEqual(form.delays, [900]);
  const html = form.dialog.innerHTML;
  assert.match(html, /<img class="menu-mascot" src="\/icon\.svg"[^>]* alt="">/);
  assert.match(html, /<p role="status">On compose ton menu…<\/p>/);
  assert.equal(html.match(/On compose ton menu|Composition du menu|Préparation du menu/g).length, 1, 'une seule annonce');
  assert.match(html, /<li>2 personnes<\/li><li>30 min max<\/li>/);
  assert.match(html, /menu-shell menu-wait/, 'bouton principal atténué pendant l’attente');
  assert.match(html, /<p id="menu-subtitle" class="muted" role="status"><\/p>/, 'pas de seconde annonce');
  assert.doesNotMatch(html, /Plat 1/, 'réponse reçue mais attente minimale en cours');
  release(); await opening;
  assert.match(form.dialog.innerHTML, /Plat 1/); assert.match(form.dialog.innerHTML, /menu-shell menu-arrive/);
  assert.doesNotMatch(form.dialog.innerHTML, /menu-mascot/);
  assert.ok(form.fields.every(field => !field.disabled));
});

test('menu guidé : ni attente ni cascade pour Remplacer, Actualiser ou un brouillon rouvert', async () => {
  const form = composer(); await form.open();
  await form.click('replace', { menuIndex: '1' }); await form.click('pick', { menuRecipe: '7' });
  assert.deepEqual(form.delays, [900]);
  assert.doesNotMatch(form.dialog.innerHTML, /menu-arrive|menu-mascot/);
  assert.equal(form.dialog.innerHTML.match(/class="menu-recipe(?: [^"]*)?"/g)[1], 'class="menu-recipe menu-recipe-new"');
  assert.equal(form.dialog.innerHTML.match(/menu-recipe-new/g).length, 1);
  form.node('[data-menu-people]').value = '2'; form.node('[data-menu-minutes]').value = '30';
  await form.click('criteria'); assert.deepEqual(form.delays, [900]);
  await form.click('close'); await form.open();
  assert.equal(form.reads.length, 3); assert.deepEqual(form.delays, [900]);
  assert.doesNotMatch(form.dialog.innerHTML, /menu-arrive|menu-recipe-new|menu-mascot/);
});

test('menu guidé : mouvement réduit, menu affiché dès la réponse sans cascade', async () => {
  const form = composer(); form.reduced = true; await form.open();
  assert.deepEqual(form.delays, []);
  assert.match(form.dialog.innerHTML, /Plat 1/);
  assert.doesNotMatch(form.dialog.innerHTML, /menu-arrive/);
});

test('menu guidé : première proposition en échec, erreur existante sans mascotte', async () => {
  const form = composer(); form.readError = new TypeError('fetch failed'); await form.open();
  assert.match(form.dialog.innerHTML, /Connexion indisponible/);
  assert.doesNotMatch(form.dialog.innerHTML, /menu-mascot/);
  assert.ok(form.fields.every(field => !field.disabled));
});

test('menu guidé : tout le mouvement est enfermé dans prefers-reduced-motion: no-preference', () => {
  const css = readFileSync(join(__dirname, 'public', 'menu-composer.css'), 'utf8');
  const marker = '@media (prefers-reduced-motion: no-preference) {';
  let outside = css, start;
  while ((start = outside.indexOf(marker)) >= 0) {
    let depth = 0, end = start + marker.length - 1;
    do { if (outside[end] === '{') depth++; else if (outside[end] === '}') depth--; end++; } while (depth);
    const block = outside.slice(start, end);
    assert.match(block, /@keyframes menu-hop/);
    assert.match(block, /@media \(max-width: 480px\) \{ #menu-dialog\[open\] \{ animation: menu-slide-in \.22s ease-out; \} \}/);
    assert.match(block, /@keyframes menu-slide-in \{ from \{ transform: translateX\(100%\); \}/);
    outside = outside.slice(0, start) + outside.slice(end);
  }
  assert.notEqual(outside, css, 'bloc de mouvement présent');
  assert.doesNotMatch(outside, /animation|@keyframes|transition/);
});

test('menu guidé : régimes différents, bascule « Un plat chacun » / « Plat commun » et plat remplacé non reproposé', async () => {
  // Profils fictifs. Faux aperçu : deuxième repas séparé par défaut, un plat par régime, le plus strict d'abord.
  const form = composer([{ id: 1, name: 'Alex', diet: 'omnivore' }, { id: 2, name: 'Sam', diet: 'pescetarian' }]);
  const dishes = [{ memberIds: [2], recipeId: 6 }, { memberIds: [1], recipeId: 7 }];
  form.answer = body => body.slots.flatMap((slot, index) => slot.dishes || (slot.split ?? (index === 1 && !slot.recipeId)) ? (slot.dishes || dishes).map(dish => ({ day: slot.day, slot: slot.slot, ...dish })) : [{ day: slot.day, slot: slot.slot, recipeId: slot.recipeId || index + 1 }]);
  await form.open();
  let html = form.dialog.innerHTML;
  assert.match(html, /6 recettes/); assert.match(html, /Pour Sam/); assert.match(html, /Pour Alex/);
  assert.equal(html.match(/data-menu-action="split"/g).length, 5, 'une bascule par repas');
  assert.equal(html.match(/>Plat commun</g).length, 1); assert.match(html, /menu-shell menu-arrive/, 'cascade conservée');
  await form.click('split', { menuMeal: '1' });
  const shared = JSON.parse(form.reads[1].options.body).slots;
  assert.deepEqual(shared[1], { day: shared[1].day, slot: shared[1].slot, split: false });
  assert.deepEqual(shared.filter((_, index) => index !== 1).map(slot => slot.recipeId), [1, 3, 4, 5], 'autres repas gardés');
  html = form.dialog.innerHTML;
  assert.match(html, /5 recettes/); assert.doesNotMatch(html, /Pour Sam/); assert.equal(html.match(/menu-recipe-new/g).length, 1);
  await form.click('split', { menuMeal: '0' });
  assert.equal(JSON.parse(form.reads[2].options.body).slots[0].split, true);
  assert.match(form.dialog.innerHTML, /6 recettes/); assert.equal(form.dialog.innerHTML.match(/menu-recipe-new/g).length, 2);
  await form.click('replace', { menuIndex: '1' });
  assert.doesNotMatch(form.node('#menu-search-results').innerHTML, /data-menu-recipe="7"/, 'recette remplacée absente');
  await form.click('pick', { menuRecipe: '8' });
  assert.deepEqual(JSON.parse(form.reads[3].options.body).slots[0].dishes, [{ memberIds: [2], recipeId: 6 }, { memberIds: [1], recipeId: 8 }]);
  await form.click('days'); form.click('save');
  const meal = JSON.parse(form.writes[0].options.body).meals[0];
  assert.equal(meal.title, 'Un plat par personne');
  assert.deepEqual(meal.dishes, [{ memberId: 2, recipeId: 6, portions: 1 }, { memberId: 1, recipeId: 8, portions: 1 }]);
});

test('menu guidé : un seul régime, aucune bascule de plat', async () => {
  const form = composer([{ id: 1, name: 'Alex', diet: 'vegan' }, { id: 2, name: 'Sam', diet: 'vegan' }]); await form.open();
  assert.doesNotMatch(form.dialog.innerHTML, /data-menu-action="split"/);
});

test('menu guidé : brouillon rouvert plus tard, les plats d’un repas séparé glissent ensemble', async () => {
  const form = composer([{ id: 1, name: 'Alex', diet: 'omnivore' }, { id: 2, name: 'Sam', diet: 'pescetarian' }], '2026-11-09');
  form.answer = body => body.slots.flatMap((slot, index) => index === 1 ? [{ memberIds: [2], recipeId: 6 }, { memberIds: [1], recipeId: 7 }].map(dish => ({ day: slot.day, slot: slot.slot, ...dish })) : [{ day: slot.day, slot: slot.slot, recipeId: index + 1 }]);
  await form.open('2026-11-09'); await form.click('close');
  form.today = '2026-11-11'; await form.open('2026-11-09'); await form.click('days'); form.click('save');
  const split = JSON.parse(form.writes[0].options.body).meals.filter(meal => meal.title === 'Un plat par personne');
  assert.equal(split.length, 1); assert.equal(split[0].dishes.length, 2);
});

test('menu guidé : les recettes déjà proposées sont envoyées à l’aperçu, remises à zéro pour une autre semaine', async () => {
  const form = composer(); await form.open();
  const seen = index => JSON.parse(form.reads[index].options.body).seenRecipeIds;
  assert.deepEqual(seen(0), []);
  form.node('[data-menu-people]').value = '2'; form.node('[data-menu-minutes]').value = '30';
  await form.click('criteria');
  assert.deepEqual(seen(1), [1, 2, 3, 4, 5]);
  await form.click('replace', { menuIndex: '0' }); await form.click('pick', { menuRecipe: '7' });
  await form.click('criteria');
  assert.deepEqual(seen(3), [1, 2, 3, 4, 5, 7]);
  await form.click('close'); await form.open('2026-11-09');
  assert.deepEqual(seen(4), []);
});

test('menu guidé : « Autres idées » visible au-dessus des cartes, « Appliquer ces critères » dans le résumé replié', async () => {
  const form = composer(); await form.open();
  const html = form.dialog.innerHTML, details = html.match(/<details class="menu-preferences">[\s\S]*?<\/details>/)[0];
  assert.match(html.replace(details, ''), /<div class="menu-count"><strong>5 recettes<\/strong><button type="button" class="secondary menu-refresh" data-menu-action="criteria" >[^<]*Autres idées<\/button><\/div>/);
  assert.match(details, /data-menu-action="criteria" >Appliquer ces critères<\/button>/);
  assert.doesNotMatch(html, /Actualiser les propositions/);
  form.node('[data-menu-people]').value = '2'; form.node('[data-menu-minutes]').value = '30';
  await form.click('criteria');
  assert.equal(form.reads.length, 2, 'le bouton visible relance l’aperçu');
});
