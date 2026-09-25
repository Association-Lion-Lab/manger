const { DatabaseSync } = require('node:sqlite');
const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const { mkdirSync, readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const derive = promisify(scrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
const DAY = 86400000;
const PAGE = readFileSync(join(__dirname, 'public', 'accounts.html'));
const publicFiles = new Set(['/api/health', '/sw.js', '/offline.html', '/offline-recipes.js', '/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png']);

function accountPath() {
  return join(dirname(process.env.MANGER_DB || join(__dirname, 'data', 'manger.db')), 'accounts.db');
}
function username(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(name)) throw new Error('Identifiant : 3 à 40 lettres sans accent, chiffres, points ou tirets.');
  return name;
}
async function passwordHash(value, salt = randomBytes(16).toString('hex')) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) throw new Error('Mot de passe : entre 12 et 256 caractères.');
  const key = await derive(value, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${key.toString('hex')}`;
}
async function matches(value, stored) {
  if (typeof value !== 'string' || value.length > 256 || value.length < 12) return false;
  const [salt, key] = stored.split(':');
  const actual = (await passwordHash(value, salt)).split(':')[1];
  return timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(actual, 'hex'));
}
function openAccounts(filename = accountPath()) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
  return db;
}
async function createAccount(db, name, password, admin = false) {
  name = username(name);
  const encoded = await passwordHash(password);
  if (db.prepare('SELECT 1 FROM accounts WHERE username=?').get(name)) throw new Error('Cet identifiant existe déjà.');
  return Number(db.prepare('INSERT INTO accounts(username,password,admin) VALUES(?,?,?)').run(name, encoded, admin ? 1 : 0).lastInsertRowid);
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new Error('Requête trop volumineuse.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Requête invalide.'); }
}

function protectAccounts(db, handler, { secure = false } = {}) {
  let busy = 0;
  const dummy = `${'0'.repeat(32)}:${'0'.repeat(64)}`;
  const cookie = (res, value, maxAge) => res.setHeader('Set-Cookie', `manger_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
  const session = req => {
    const token = /(?:^|;\s*)manger_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    return token && db.prepare('SELECT a.id,a.username,a.admin,a.password,s.token FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token=? AND s.expires>? AND a.active=1').get(hash(token), Date.now());
  };
  function throttle(req, name) {
    const now = Date.now();
    db.prepare('DELETE FROM attempts WHERE expires<=?').run(now);
    const keys = [['global', 60], [`ip:${hash(req.socket.remoteAddress || '')}`, 20], [`name:${hash(name)}`, 8]];
    if (keys.some(([key, max]) => (db.prepare('SELECT count FROM attempts WHERE key=?').get(key)?.count || 0) >= max)) return false;
    for (const [key] of keys) db.prepare('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + 15 * 60000);
    return true;
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; } catch { return json(res, 400, { error: 'Adresse invalide.' }); }
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        // No proxy headers trusted. An explicit Secure setting is needed after HTTPS deployment.
        const origin = `${secure ? 'https' : 'http'}://${req.headers.host}`;
        if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Origine de la requête refusée.' });
      }
      if (req.method === 'GET' && publicFiles.has(path)) return handler(req, res);
      if (req.method === 'GET' && ['/login', '/account'].includes(path)) {
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(PAGE);
      }
      if (req.method === 'POST' && path === '/api/account/login') {
        const data = await body(req);
        const name = String(data.username || '').trim().toLowerCase().slice(0, 256);
        if (busy >= 2 || !throttle(req, name)) return json(res, 429, { error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
        busy++;
        try {
          const user = db.prepare('SELECT * FROM accounts WHERE username=?').get(name);
          const valid = await matches(data.password, user?.password || dummy);
          // Re-read after asynchronous hashing: a disabled/reset account must not regain access.
          const current = user && db.prepare('SELECT * FROM accounts WHERE id=?').get(user.id);
          if (!valid || !current?.active || current.password !== user.password) return json(res, 401, { error: 'Identifiant ou mot de passe incorrect.' });
          db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
          const token = randomBytes(32).toString('hex');
          db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), user.id, Date.now() + 7 * DAY);
          cookie(res, token, 7 * 86400);
          return json(res, 200, { ok: true });
        } finally { busy--; }
      }
      const user = session(req);
      if (!user) {
        if (req.method === 'GET' && path === '/') { res.writeHead(303, { Location: '/login' }); return res.end(); }
        return json(res, 401, { error: 'Connecte-toi pour accéder au foyer.' });
      }
      if (req.method === 'GET' && path === '/api/account') return json(res, 200, { id: user.id, username: user.username, admin: Boolean(user.admin) });
      if (req.method === 'POST' && path === '/api/account/logout') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(user.token);
        cookie(res, '', 0);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/account/logout-all') {
        db.prepare('DELETE FROM sessions WHERE account_id=?').run(user.id);
        cookie(res, '', 0);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/account/password') {
        const data = await body(req);
        if (busy >= 2 || !throttle(req, user.username)) return json(res, 429, { error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
        busy++;
        try {
          if (!await matches(data.current, user.password)) return json(res, 400, { error: 'Mot de passe actuel incorrect.' });
          const encoded = await passwordHash(data.password);
          if (!session(req) || db.prepare('SELECT password FROM accounts WHERE id=?').get(user.id)?.password !== user.password) return json(res, 401, { error: 'Reconnecte-toi.' });
          db.prepare('UPDATE accounts SET password=? WHERE id=?').run(encoded, user.id);
          db.prepare('DELETE FROM sessions WHERE account_id=?').run(user.id);
          cookie(res, '', 0);
          return json(res, 200, { ok: true });
        } finally { busy--; }
      }
      const adminRoute = path.startsWith('/api/accounts') || path === '/api/backup' || path.startsWith('/api/restore/');
      if (adminRoute && !user.admin) return json(res, 403, { error: 'Cette action est réservée à l’administrateur.' });
      if (req.method === 'GET' && path === '/api/accounts') return json(res, 200, db.prepare('SELECT id,username,admin,active FROM accounts ORDER BY username').all());
      if (req.method === 'POST' && path === '/api/accounts') {
        const data = await body(req);
        if (busy >= 2) return json(res, 429, { error: 'Réessaie dans un instant.' });
        busy++;
        try {
          // Hash before checking the administrator again, to avoid a permission race.
          const name = username(data.username); const encoded = await passwordHash(data.password);
          if (!session(req)?.admin) return json(res, 403, { error: 'Droit administrateur requis.' });
          if (db.prepare('SELECT 1 FROM accounts WHERE username=?').get(name)) throw new Error('Cet identifiant existe déjà.');
          db.prepare('INSERT INTO accounts(username,password,admin) VALUES(?,?,?)').run(name, encoded, data.admin === true ? 1 : 0);
          return json(res, 201, { ok: true });
        } finally { busy--; }
      }
      if (req.method === 'PUT' && /^\/api\/accounts\/\d+$/.test(path)) {
        const id = Number(path.split('/').pop()); const data = await body(req);
        if (!session(req)?.admin) return json(res, 403, { error: 'Droit administrateur requis.' });
        if (id === user.id) throw new Error('Tu ne peux pas désactiver ton propre accès.');
        if (typeof data.active !== 'boolean') throw new Error('État invalide.');
        if (!db.prepare('SELECT 1 FROM accounts WHERE id=?').get(id)) return json(res, 404, { error: 'Compte introuvable.' });
        db.prepare('UPDATE accounts SET active=? WHERE id=?').run(data.active ? 1 : 0, id);
        db.prepare('DELETE FROM sessions WHERE account_id=?').run(id);
        return json(res, 200, { ok: true });
      }
      return handler(req, res);
    } catch (error) { return json(res, 400, { error: error.message }); }
  };
}

// Run locally on the server: no public registration or first-visitor administrator.
if (require.main === module) {
  (async () => {
    const [command, name] = process.argv.slice(2);
    if (!['create-admin', 'reset-password'].includes(command) || !name) throw new Error('Usage : node accounts.js create-admin|reset-password identifiant');
    const normalized = username(name); const db = openAccounts();
    try {
      const password = randomBytes(18).toString('base64url');
      if (command === 'create-admin') await createAccount(db, normalized, password, true);
      else {
        const encoded = await passwordHash(password);
        const account = db.prepare('SELECT id FROM accounts WHERE username=?').get(normalized);
        if (!account) throw new Error('Compte introuvable.');
        db.prepare('UPDATE accounts SET password=?,active=1 WHERE id=?').run(encoded, account.id);
        db.prepare('DELETE FROM sessions WHERE account_id=?').run(account.id);
      }
      console.log(`Identifiant : ${normalized}\nMot de passe généré : ${password}\nConserve-le dans ton gestionnaire de mots de passe. Ne le partage pas dans les journaux ou captures.`);
    } finally { db.close(); }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { accountPath, openAccounts, createAccount, protectAccounts };
