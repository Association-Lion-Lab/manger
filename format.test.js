const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

test('les libellés conservent le nom des ingrédients et élident les voyelles', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const code = html.match(/function formatAmount[\s\S]*?(?=    function escapeHtml)/)[0];
  const format = runInNewContext(`${code}; shoppingText`);
  assert.equal(format({ amount: 2, unit: 'pièce', name: 'courgettes' }), '2 × courgettes');
  assert.equal(format({ amount: 1, unit: 'pièce', name: 'courgette' }), '1 × courgette');
  assert.equal(format({ amount: 2, unit: 'pièce', name: 'oignon rouge' }), '2 × oignon rouge');
  assert.equal(format({ amount: 150, unit: 'ml', name: 'eau' }), '150 ml d’eau');
  assert.equal(format({ amount: 1.5, unit: 'c. à soupe', name: 'huile d’olive' }), '1,5 c. à soupe d’huile d’olive');
  assert.equal(format({ amount: 160, unit: 'g', name: 'riz' }), '160 g de riz');
  assert.equal(format({ amount: 5, unit: 'gousse', name: 'ail' }), '5 gousses d’ail');
  assert.equal(format({ amount: 1, unit: 'gousse', name: 'ail' }), '1 gousse d’ail');
  assert.equal(format({ amount: 1.5, unit: 'tranche', name: 'pain' }), '1,5 tranche de pain');
  assert.equal(format({ amount: 2, unit: 'pincée', name: 'sel' }), '2 pincées de sel');
  assert.equal(format({ amount: 3, unit: 'c. à soupe', name: 'miel' }), '3 c. à soupe de miel');
  assert.equal(format({ amount: 3, unit: ' Gousse ', name: 'ail' }), '3 Gousses d’ail');
  assert.equal(format({ amount: 3, unit: 'tranches', name: 'pain' }), '3 tranches de pain');
});
