const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('la fiche expose fermeture, favoris et actions avant les ingrédients sans dupliquer les contrôles', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const sheet = html.match(/<dialog id="recipe-view-dialog"[\s\S]*?<\/dialog>/)[0];
  assert.match(sheet, /aria-labelledby="recipe-view-title"/);
  for (const id of ['favorite-recipe', 'close-recipe-view', 'plan-recipe', 'start-cooking', 'recipe-view-portions', 'recipe-view-error']) {
    assert.equal([...html.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1);
    assert.ok(sheet.indexOf(`id="${id}"`) < sheet.indexOf('id="recipe-view-ingredients"'));
  }
  assert.match(sheet, /id="close-recipe-view"[^>]*aria-label="Fermer la recette"[^>]*autofocus/);
  assert.match(sheet, /id="recipe-view-portions"[^>]*min="1"[^>]*max="100"[^>]*aria-describedby="recipe-portions-description"/);
  assert.match(sheet, /<summary>Gérer cette recette<\/summary>/);
  assert.doesNotMatch(sheet, /Plus d’options/);
  assert.match(html, /recipeViewDialog.showModal\(\);\s*recipeViewDialog.scrollTop = 0;/);
});
