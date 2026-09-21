const { DatabaseSync, backup } = require('node:sqlite');
const { mkdtemp, writeFile, rm, mkdir } = require('node:fs/promises');
const { join, dirname } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID } = require('node:crypto');
const { checkBackup } = require('./backup-tools');

const quote = name => '"' + name.replaceAll('"', '""') + '"';
function schema(db) {
  const rows = db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND type <> 'index' ORDER BY name").all();
  if (rows.some(row => row.type !== 'table' || /CREATE\s+VIRTUAL/i.test(row.sql))) throw new Error('Cette sauvegarde contient une structure non prise en charge.');
  return rows.map(row => ({ name: row.name, columns: db.prepare(`PRAGMA table_info(${quote(row.name)})`).all().map(column => column.name) }));
}

function createRestore(db) {
  let pending;
  const clear = async () => {
    const previous = pending; pending = null;
    if (previous) { clearTimeout(previous.timer); await rm(previous.folder, { recursive: true, force: true }); }
  };
  return {
    async preview(request) {
      const main = db.prepare('PRAGMA database_list').all().find(row => row.name === 'main');
      if (!main?.file) throw new Error('Restauration disponible uniquement sur une base persistante.');
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) throw new Error('Fichier trop volumineux : 32 Mo maximum.');
        chunks.push(chunk);
      }
      if (!size) throw new Error('Choisis une sauvegarde SQLite.');
      await clear();
      const folder = await mkdtemp(join(tmpdir(), 'manger-restore-'));
      try {
        const file = join(folder, 'candidate.db'); await writeFile(file, Buffer.concat(chunks), { mode: 0o600 });
        const summary = checkBackup(file);
        if (summary.version !== db.prepare('PRAGMA user_version').get().user_version) throw new Error('Version différente : utilise l’outil de restauration en ligne de commande.');
        const candidate = new DatabaseSync(file, { readOnly: true });
        try { if (JSON.stringify(schema(candidate)) !== JSON.stringify(schema(db))) throw new Error('Structure incompatible : utilise l’outil de restauration en ligne de commande.'); }
        finally { candidate.close(); }
        const token = randomUUID();
        const timer = setTimeout(() => { clear().catch(() => {}); }, 10 * 60 * 1000); timer.unref();
        pending = { token, file, folder, timer, expires: Date.now() + 10 * 60 * 1000, mainFile: main.file };
        return { token, ...summary };
      } catch (error) { await rm(folder, { recursive: true, force: true }); throw error; }
    },
    async apply(token) {
      if (!pending || pending.token !== token || Date.now() >= pending.expires) throw new Error('Aperçu expiré. Vérifie à nouveau le fichier.');
      clearTimeout(pending.timer);
      try {
      const recoveryFolder = join(dirname(pending.mainFile), 'recovery'); await mkdir(recoveryFolder, { recursive: true });
      const recoveryName = `before-restore-${randomUUID()}.db`;
      await backup(db, join(recoveryFolder, recoveryName));
      const tables = schema(db);
      db.prepare('ATTACH DATABASE ? AS restoration').run(pending.file);
      try {
        db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
        try {
          for (const table of tables) db.exec(`DELETE FROM main.${quote(table.name)}`);
          for (const table of tables) {
            const columns = table.columns.map(quote).join(',');
            db.exec(`INSERT INTO main.${quote(table.name)} (${columns}) SELECT ${columns} FROM restoration.${quote(table.name)}`);
          }
          if (db.prepare('PRAGMA main.foreign_key_check').all().length) throw new Error('Relations invalides dans la sauvegarde.');
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        finally { db.exec('PRAGMA foreign_keys=ON'); }
      } finally { db.exec('DETACH DATABASE restoration'); }
      return { restored: true, recovery: `recovery/${recoveryName}` };
      } finally {
        // A cleanup failure must not report a committed restoration as failed.
        await clear().catch(error => console.error('Nettoyage du fichier temporaire de restauration :', error.message));
      }
    },
    clear
  };
}
module.exports = { createRestore };
