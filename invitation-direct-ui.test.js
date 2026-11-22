const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const accounts = readFileSync(join(__dirname, 'public/accounts.html'), 'utf8');
const index = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

function extract(html, name) {
  return html.match(new RegExp(`function ${name}\\(\\)[^\\n]*`))[0];
}

test('invitation directe : le bouton du compte vise la section d’invitation', () => {
  assert.match(index, /<a id="account-invite" href="\/account#invitation-options" hidden>/);
});

test('invitation directe : la section s’ouvre et vient en haut pour un administrateur seulement, sans créer de lien', () => {
  for (const [hash, admin, opened] of [['#invitation-options', true, true], ['#invitation-options', false, false], ['', true, false], ['#invite=' + 'a'.repeat(64), true, false]]) {
    const details = { open: false, scrolls: [], scrollIntoView(options) { this.scrolls.push(options); } };
    const calls = [];
    new Script(extract(accounts, 'openInvitationFromLink') + ';openInvitationFromLink();').runInNewContext({
      $: id => (id === 'invitation-options' ? details : assert.fail(id)), location: { hash }, me: { admin }, api: () => calls.push('api')
    });
    assert.equal(details.open, opened, hash + admin);
    assert.equal(details.scrolls.length, opened ? 1 : 0);
    assert.equal(calls.length, 0);
  }
  // Ouverte aussi si la liste des comptes ne se charge pas.
  assert.match(accounts, /if\(me\.admin\)await people\(\)\.finally\(openInvitationFromLink\);/);
});

test('invitation directe : « ‹ Compte » ramène à l’onglet Compte de l’appli', () => {
  assert.match(accounts, /<a class="button" href="\/#account">‹ Compte<\/a>/);
  assert.doesNotMatch(accounts, /Revenir aux repas/);
  for (const [hash, clicked] of [['#account', 1], ['', 0], ['#week', 0]]) {
    let clicks = 0; const replaced = [];
    new Script(extract(index, 'openPanelFromLink') + ';openPanelFromLink();').runInNewContext({
      location: { hash, pathname: '/', search: '' },
      history: { replaceState: (...args) => replaced.push(args) },
      document: { querySelector: selector => { assert.equal(selector, 'nav [data-panel="account"]'); return { click: () => clicks++ }; } }
    });
    assert.equal(clicks, clicked, hash);
    assert.equal(replaced.length, clicked);
  }
  // Avant l'abonnement Faim de Lion à la barre, pour un seul rafraîchissement.
  assert.match(index, /\n\s*openPanelFromLink\(\);[\s\S]{0,200}MangerFdl\.create/);
});

test('invitation directe : les lignes repliées de la page compte font au moins 44 px', () => {
  assert.match(accounts, /summary\{min-height:44px;padding:10px 0;cursor:pointer\}/);
});
