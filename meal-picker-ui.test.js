const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
function pickerContext(members = [], currentMeal = null) {
  const elements = {};
  const element = id => elements[id] ||= {
    innerHTML: '', hidden: false, disabled: false,
    insertAdjacentHTML(_, value) { this.innerHTML = value + this.innerHTML; },
    focus() { this.focused = true; },
  };
  const context = {
    document: { getElementById: element, querySelector: () => element('focused-control') },
    state: { selected: 2, members }, fullDayNames: ['Lundi', 'Mardi', 'Mercredi'],
    dialog: { open: false, scrollTop: 400, showModal() { this.open = true; } },
    mealFor: () => currentMeal, escapeHtml: String,
    recipePicker: () => '<input id="picker-search"><div id="picker-recipes"></div>',
    renderPickerRecipes() { context.renders++; }, renders: 0,
  };
  const choice = html.match(/^    function choice\([\s\S]*?(?=\n    function openAdd)/m)[0];
  const views = html.match(/^    function openAdd\([\s\S]*?(?=\n    function openMealActions)/m)[0];
  new Script(choice + views).runInNewContext(context);
  return { context, element };
}

test('ajouter un repas montre les types de repas, pas le catalogue complet', () => {
  const { context, element } = pickerContext();
  context.openAdd('soir');
  assert.match(element('choices').innerHTML, /Choisir une recette/);
  for (const title of ['Manger à l’extérieur', 'Prévoir un date', 'Inviter du monde']) assert.ok(element('choices').innerHTML.includes(title));
  assert.doesNotMatch(element('choices').innerHTML, /picker-search|picker-recipes|Un plat par personne|data-remove/);
  assert.equal(context.renders, 0);
  assert.equal(context.state.slot, 'soir');
  assert.equal(element('dialog-subtitle').textContent, 'Mercredi · Soir');
  assert.equal(context.dialog.open, true);
});

test('les assiettes individuelles et le retrait restent accessibles si pertinents', () => {
  const { context, element } = pickerContext([{ id: 1 }], { title: 'Repas existant' });
  context.openAdd('midi');
  assert.match(element('choices').innerHTML, /Un plat par personne/);
  assert.match(element('choices').innerHTML, /Retirer ce repas/);
  assert.doesNotMatch(element('choices').innerHTML, /picker-recipes/);
});

test('le choix d’une recette conserve le créneau et permet de revenir aux types', () => {
  const { context, element } = pickerContext();
  context.openAdd('midi');
  context.openRecipeChoices();
  assert.equal(element('dialog-title').textContent, 'Choisir une recette');
  assert.equal(element('dialog-subtitle').textContent, 'Mercredi · Midi');
  assert.match(element('choices').innerHTML, /data-mealback/);
  assert.match(element('choices').innerHTML, /picker-search/);
  assert.equal(context.renders, 1);
  assert.equal(context.dialog.scrollTop, 0);
  assert.equal(element('focused-control').focused, true);
  context.openAdd(context.state.slot);
  assert.doesNotMatch(element('choices').innerHTML, /picker-search/);
  assert.equal(context.state.slot, 'midi');
});

test('les nouveaux boutons suivent la navigation du dialogue et le verrou de sauvegarde', () => {
  const source = html.match(/^    document.getElementById\('choices'\).addEventListener\('click',[\s\S]*?(?=\n    document.getElementById\('choices'\).addEventListener\('change')/m)[0];
  let click, action;
  const fields = { disabled: false };
  new Script(source).runInNewContext({
    document: { getElementById: id => id === 'choices' ? { addEventListener: (_, handler) => click = handler } : fields },
    state: { slot: 'soir' }, openAdd: slot => action = slot, openRecipeChoices: () => action = 'recipes',
  });
  click({ target: { closest: selector => selector === '.choice' ? { dataset: { pickrecipe: 'true' } } : null } });
  assert.equal(action, 'recipes');
  click({ target: { closest: selector => selector === '[data-mealback]' ? {} : null } });
  assert.equal(action, 'soir');
  fields.disabled = true; action = null;
  click({ target: { closest: () => { throw new Error('La sauvegarde doit bloquer la navigation'); } } });
  assert.equal(action, null);
});
