const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

function loadDirectory(directory) {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    if (file.isDirectory()) loadDirectory(join(directory, file.name));
    else if (file.name.endsWith('.js') && !file.name.endsWith('.test.js')) require(join(directory, file.name));
  }
}

function checkImage() {
  assert.equal(typeof require('./db/postgres').openPostgres, 'function');
  // CLI modules must keep their side effects behind require.main === module.
  for (const file of readdirSync(__dirname)) {
    if (file.endsWith('.js') && !file.endsWith('.test.js') && file !== 'image-check.js') require(join(__dirname, file));
  }
  loadDirectory(join(__dirname, 'db'));
  readFileSync(join(__dirname, 'public', 'third-party-notices.txt'), 'utf8');
  const { createDatabase } = require('./server');
  const { openAccounts } = require('./accounts');
  for (const open of [createDatabase, openAccounts]) {
    const db = open(':memory:');
    try { assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok'); }
    finally { db.close(); }
  }
  const manifest = JSON.parse(readFileSync(join(__dirname, 'public', 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) readFileSync(join(__dirname, 'public', icon.src.replace(/^\//, '')));
  console.log('Image Manger! : modules, pages, licences, icônes et SQLite vérifiés sans base persistante ni connexion PostgreSQL.');
}

if (require.main === module) {
  try { checkImage(); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
module.exports = { checkImage };
