const { DatabaseSync, backup } = require('node:sqlite');
const { open, unlink } = require('node:fs/promises');
const { resolve } = require('node:path');

function checkBackup(filename) {
  const db = new DatabaseSync(resolve(filename), { readOnly: true });
  try {
    db.exec('PRAGMA trusted_schema=OFF');
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Sauvegarde endommagée ou relations invalides.');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 4) throw new Error('Sauvegarde issue d’une version plus récente de Manger. Mets l’application à jour.');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => row.name));
    for (const name of ['recipes', 'recipe_ingredients', 'recipe_steps', 'ingredients', 'members', 'meals', 'pantry', 'proteins']) if (!tables.has(name)) throw new Error('Ce fichier ne correspond pas à une sauvegarde complète de Manger.');
    if (version >= 3 && !tables.has('week_templates')) throw new Error('Ce fichier ne correspond pas à une sauvegarde complète de Manger.');
    return { version, recipes: db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n, members: db.prepare('SELECT COUNT(*) AS n FROM members').get().n, meals: db.prepare('SELECT COUNT(*) AS n FROM meals').get().n };
  } finally { db.close(); }
}

async function restoreBackup(source, destination) {
  checkBackup(source);
  const target = resolve(destination);
  // Exclusive creation refuses existing databases, directories and symlinks.
  const reserved = await open(target, 'wx', 0o600); await reserved.close();
  let db;
  try {
    db = new DatabaseSync(resolve(source), { readOnly: true });
    await backup(db, target);
    checkBackup(target);
  } catch (error) {
    await unlink(target);
    throw error;
  } finally { db?.close(); }
  return target;
}

if (require.main === module) {
  const [command, source, destination, extra] = process.argv.slice(2);
  (async () => {
    if (command === 'check' && source && !destination) console.log('Sauvegarde vérifiée :', checkBackup(source));
    else if (command === 'restore' && source && destination && !extra) {
      const target = await restoreBackup(source, destination);
      console.log(`Copie restaurée : ${target}\nLa base active est inchangée. Arrête Manger avant de choisir ce fichier via MANGER_DB.`);
    } else throw new Error('Usage : node backup-tools.js check fichier.db | restore sauvegarde.db nouveau-fichier.db');
  })().catch(error => { console.error(error.code === 'EEXIST' ? 'Destination déjà existante : aucun fichier remplacé. Choisis un nouveau nom.' : error.message); process.exitCode = 1; });
}

module.exports = { checkBackup, restoreBackup };
