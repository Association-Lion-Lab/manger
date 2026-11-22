const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const index = readFileSync(join(__dirname, 'public/index.html'), 'utf8');

test('Mon foyer : une entrée « Personnes et régimes » et une entrée « Sauvegarde du foyer »', () => {
  assert.match(index, /<button id="account-household" type="button">[^\n]*<strong>Personnes et régimes<\/strong>/);
  assert.match(index, /<button id="account-backup" type="button" hidden>[^\n]*<strong>Sauvegarde du foyer<\/strong>/);
  assert.doesNotMatch(index, /account-tastes|Goûts et régimes|Personnes du foyer/);
  assert.match(index, /getElementById\('account-backup'\)\.addEventListener\('click', openHouseholdBackup\)/);
  // Comme la sauvegarde dans la fenêtre : réservée aux administrateurs.
  assert.match(index, /closest\('details'\)\.hidden = document\.getElementById\('account-backup'\)\.hidden = !account\.admin;/);
});

test('Mon foyer : la ligne Sauvegarde ouvre la fenêtre sur la sauvegarde dépliée, en haut', () => {
  const calls = [];
  const backup = { open: false, scrollIntoView: options => calls.push(['scroll', options]) };
  const summary = { focus: options => calls.push(['focus', options]) };
  const nodes = { 'backup-details': backup, 'backup-summary': summary };
  new Script(index.match(/function openHouseholdBackup\(\)[^\n]*/)[0] + ';openHouseholdBackup();').runInNewContext({
    householdDialog: { showModal: () => calls.push(['modal']) },
    document: { getElementById: id => nodes[id] || assert.fail(id) }
  });
  assert.equal(backup.open, true);
  assert.deepEqual(calls.map(call => call[0]), ['modal', 'scroll', 'focus']);
  assert.equal(JSON.stringify(calls[1][1]), '{"block":"start"}'); // objet créé dans le contexte vm
});

test('Mon foyer : Bar à protéines et Sauvegarde repliés par défaut, sans lien vers le compte', () => {
  assert.match(index, /<details id="protein-details" class="quiet-details"><summary>Bar à protéines<\/summary>[\s\S]*?id="protein-list"[\s\S]*?<\/details>/);
  assert.match(index, /<details id="backup-details" class="quiet-details">\s*<summary id="backup-summary">Sauvegarde du foyer<\/summary>/);
  assert.doesNotMatch(index, /Mon compte et les accès au foyer/);
  // Une erreur du bar à protéines rouvre son bloc pour rester visible.
  assert.match(index, /function showHouseholdError\(error\) \{[^}]*getElementById\('protein-details'\)\.open = true;/);
  assert.match(index, /Compte → Personnes et régimes/);
});

test('Mon foyer : pastilles aux couleurs du thème et de 44 px dans la fenêtre', () => {
  assert.match(index, /\.household-list \.food-tag \{ min-height: 44px;/);
  assert.doesNotMatch(index, /\.food-tag\[data-category="\w+"\][^}]*#[0-9a-f]{3,6}/i);
  for (const family of ['fish', 'meat', 'egg']) {
    assert.match(index, new RegExp(`:root \\{[^}]*--${family}: #`), family);
    assert.match(index, new RegExp(`:root\\[data-mode="dark"\\] \\{[^}]*--${family}: #`), family);
  }
});
