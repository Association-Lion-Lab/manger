const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

test('le minuteur utilise une échéance et conserve la durée en pause', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const code = html.match(/function timerSeconds[\s\S]*?(?=    function renderCookingTimers)/)[0];
  const seconds = runInNewContext(`${code}; timerSeconds`);
  assert.equal(seconds({ end: null, remaining: 45 }, 999999), 45);
  assert.equal(seconds({ end: 61000, remaining: 60 }, 1000), 60);
  assert.equal(seconds({ end: 61000, remaining: 60 }, 60500), 1);
  assert.equal(seconds({ end: 61000, remaining: 60 }, 90000), 0);
});

test('les portions recalculent sans modifier la recette et refusent les valeurs invalides', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const code = html.match(/function scaledIngredients[\s\S]*?(?=    function renderPortions)/)[0];
  const scale = runInNewContext(`${code}; scaledIngredients`);
  const recipe = { servings: 2, ingredients: [{ name: 'riz', amount: 160, unit: 'g' }, { name: 'œuf', amount: 2, unit: 'pièce' }] };
  assert.equal(scale(recipe, 4)[0].amount, 320);
  assert.equal(scale(recipe, 1)[1].amount, 1);
  assert.equal(scale(recipe, 3)[1].amount, 3);
  assert.equal(recipe.ingredients[0].amount, 160);
  for (const invalid of [0, -1, 1.5, 101, NaN, Infinity, '2']) assert.throws(() => scale(recipe, invalid));
});
