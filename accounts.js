const { DatabaseSync } = require('node:sqlite');
const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const { mkdirSync, readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { emailAddress } = require('./invitation-mail');
const { sqliteAuth } = require('./db/auth-sqlite');
const { storageEngine } = require('./db/storage');
const derive = promisify(scrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
const PAGE = Buffer.from(readFileSync(join(__dirname, 'public', 'accounts.html'), 'utf8')
  .replace('<!-- MANGER_INFORMATION -->', readFileSync(join(__dirname, 'public', 'information.html'), 'utf8')));
const publicFiles = new Set(['/api/health', '/sw.js', '/offline.html', '/offline-recipes.js', '/offline-shopping.js', '/manifest.webmanifest', '/icon.svg', '/apple-touch-icon.png', '/icon-180.png', '/icon-192.png', '/icon-512.png']);

function accountPath() {
  return join(dirname(process.env.MANGER_DB || join(__dirname, 'data', 'manger.db')), 'accounts.db');
}
function inputError(message, status = 400) {
  const error = new Error(message); error.code = 'MANGER_ACCOUNT_INPUT'; error.status = status; return error;
}
function checked(result) {
  const errors = {
    forbidden:[403,'Droit administrateur requis.'], duplicate:[400,'Cet identifiant existe déjà.'],
    'duplicate-invitee':[400,'Cet identifiant existe déjà. Choisis-en un autre.'],
    invitation:[400,'Invitation expirée, utilisée ou annulée. Demande un nouveau lien.'],
    'invitation-mail':[400,'Invitation expirée, utilisée ou annulée. Crée un nouveau lien.'],
    self:[400,'Tu ne peux pas désactiver ton propre accès.'], missing:[404,'Compte introuvable.'],
    'mail-limit':[429,'Limite de 5 envois par heure atteinte. Utilise la copie du lien ou réessaie plus tard.']
  };
  if (typeof result === 'string' && errors[result]) {const [status,message] = errors[result];throw inputError(message,status);}
  return result;
}
function username(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(name)) throw inputError('Identifiant : 3 à 40 lettres sans accent, chiffres, points ou tirets.');
  return name;
}
async function passwordHash(value, salt = randomBytes(16).toString('hex')) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) throw inputError('Mot de passe : entre 12 et 256 caractères.');
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
  try {
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invitations(id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL UNIQUE, creator INTEGER NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);`);
  return db;
  }catch(error){db.close();throw error;}
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
    if (size > 4096) throw inputError('Requête trop volumineuse.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw inputError('Requête invalide.');
    return value;
  } catch { throw inputError('Requête invalide.'); }
}

function protectAccounts(db, handler, { secure = false, mailer = null, certificate = null, auth: repository = null, backupReady = false } = {}) {
  if (repository && db) throw new Error('Fournir un seul stockage de comptes, jamais deux moteurs.');
  const auth = repository || sqliteAuth(db);
  let busy = 0, mailBusy = false;
  const dummy = `${'0'.repeat(32)}:${'0'.repeat(64)}`;
  const cookie = (res, value, maxAge) => res.setHeader('Set-Cookie', `manger_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
  const session = req => {
    const token = /(?:^|;\s*)manger_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    return token ? auth.session(hash(token)) : undefined;
  };
  function throttle(req, name) {
    const keys = [['global', 60], [`ip:${hash(req.socket.remoteAddress || '')}`, 20], [`name:${hash(name)}`, 8]];
    return auth.throttle(keys);
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; } catch { return json(res, 400, { error: 'Adresse invalide.' }); }
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        // No proxy headers trusted. An explicit Secure setting is needed after HTTPS deployment.
        const origin = `${secure ? 'https' : 'http'}://${req.headers.host}`;
        if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Origine de la requête refusée.' });
      }
      if (req.method === 'GET' && publicFiles.has(path)) return await handler(req, res);
      if (req.method === 'GET' && ['/login', '/account'].includes(path)) {
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; manifest-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(PAGE);
      }
      if (req.method === 'POST' && path === '/api/account/login') {
        const data = await body(req);
        const name = String(data.username || '').trim().toLowerCase().slice(0, 256);
        if (busy >= 2) return json(res, 429, { error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
        busy++;
        try {
          if (!await throttle(req, name)) return json(res, 429, { error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
          const user = await auth.findUser(name);
          const valid = await matches(data.password, user?.password || dummy);
          const token = randomBytes(32).toString('hex');
          if (!valid || !user || !await auth.startSession(user, hash(token))) return json(res, 401, { error: 'Identifiant ou mot de passe incorrect.' });
          cookie(res, token, 7 * 86400);
          return json(res, 200, { ok: true });
        } finally { busy--; }
      }
      if (req.method === 'POST' && path === '/api/account/join') {
        if (await session(req)) return json(res, 409, { error: 'Tu es déjà connecté. Ouvre le lien sur l’appareil du nouveau membre.' });
        const data = await body(req);
        if (busy >= 2) return json(res, 429, { error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
        busy++;
        try {
          if (!await throttle(req, String(data.username || '').trim().toLowerCase().slice(0,256))) return json(res, 429, { error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
          const token = typeof data.token === 'string' && /^[a-f0-9]{64}$/.test(data.token) ? hash(data.token) : '';
          if (!await auth.invitation(token)) checked('invitation');
          const name = username(data.username);
          const encoded = await passwordHash(data.password);
          checked(await auth.join(token, name, encoded));
          return json(res, 201, { ok: true });
        } finally { busy--; }
      }
      const user = await session(req);
      if (!user) {
        if (req.method === 'GET' && path === '/') { res.writeHead(303, { Location: '/login' }); return res.end(); }
        return json(res, 401, { error: 'Connecte-toi pour accéder au foyer.' });
      }
      const certificateReady = secure && certificate && Date.now() < Date.parse(certificate.validTo);
      if (req.method === 'GET' && path === '/api/account') return json(res, 200, {
        id: user.id, username: user.username, admin: Boolean(user.admin), invitationEmailEnabled: Boolean(user.admin && mailer),
        localCertificate: user.admin && certificateReady ? { fingerprint: certificate.fingerprint256 } : null,
      });
      if (req.method === 'POST' && path === '/api/account/logout') {
        if (!await auth.logout(user, false)) return json(res, 401, { error: 'Reconnecte-toi.' });
        cookie(res, '', 0);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/account/logout-all') {
        if (!await auth.logout(user, true)) return json(res, 401, { error: 'Reconnecte-toi.' });
        cookie(res, '', 0);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/account/password') {
        const data = await body(req);
        if (busy >= 2) return json(res, 429, { error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
        busy++;
        try {
          if (!await throttle(req, user.username)) return json(res, 429, { error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
          if (!await matches(data.current, user.password)) return json(res, 400, { error: 'Mot de passe actuel incorrect.' });
          const encoded = await passwordHash(data.password);
          if (!await auth.changePassword(user, encoded)) return json(res, 401, { error: 'Reconnecte-toi.' });
          cookie(res, '', 0);
          return json(res, 200, { ok: true });
        } finally { busy--; }
      }
      const adminRoute = path.startsWith('/api/accounts') || path === '/api/backup' || path.startsWith('/api/restore/');
      if (adminRoute && !user.admin) return json(res, 403, { error: 'Cette action est réservée à l’administrateur.' });
      if (auth.engine === 'postgres' && ((path === '/api/backup'&&!backupReady)||path.startsWith('/api/restore/'))) return json(res, 503, { error: 'Ce parcours PostgreSQL n’est pas encore disponible.' });
      if (path === '/api/accounts/certificate' && req.method === 'GET') {
        if (!certificateReady) return json(res, 404, { error: 'Certificat local indisponible. Vérifie la configuration HTTPS et MANGER_TLS_CA sur le serveur.' });
        res.writeHead(200, { 'Content-Type': 'application/pkix-cert', 'Content-Disposition': 'attachment; filename="manger-ca.cer"', 'Content-Length': certificate.raw.length });
        return res.end(certificate.raw);
      }
      if (path === '/api/accounts/invitation/email' && req.method === 'POST') {
        if (!mailer) return json(res, 503, { error: 'L’envoi de courriels n’est pas configuré sur ce serveur. Utilise le partage ou la copie du lien.' });
        const data = await body(req);
        let to;
        try {to = emailAddress(data.to);} catch (error) {throw inputError(error.message);}
        const token = typeof data?.token === 'string' && /^[a-f0-9]{64}$/.test(data.token) ? data.token : '';
        if (mailBusy) return json(res, 429, { error: 'Un envoi est déjà en cours. Attends sa confirmation.' });
        mailBusy = true;
        try {
          const invitation = checked(await auth.prepareMail(user, hash(token)));
          try {
            await mailer.send(to, token, invitation.expires);
            return json(res, 200, { ok: true }); // SMTP acceptance is not proof of inbox delivery.
          } catch {
            return json(res, 503, { error: 'L’envoi n’a pas pu être confirmé. Le lien reste disponible. Vérifie la boîte du destinataire avant de réessayer, ou copie le lien.' });
          }
        } finally { mailBusy = false; }
      }
      if (path === '/api/accounts/invitation' && req.method === 'POST') {
        const token = randomBytes(32).toString('hex');
        const { expires } = checked(await auth.issueInvitation(user, hash(token)));
        return json(res, 201, { token, expires });
      }
      if (path === '/api/accounts/invitation' && req.method === 'DELETE') {
        checked(await auth.revokeInvitation(user));
        return json(res, 200, { ok: true });
      }
      if (req.method === 'GET' && path === '/api/accounts') return json(res, 200, checked(await auth.listAccounts(user)));
      if (req.method === 'POST' && path === '/api/accounts') {
        const data = await body(req);
        if (busy >= 2) return json(res, 429, { error: 'Réessaie dans un instant.' });
        busy++;
        try {
          // Hash before checking the administrator again, to avoid a permission race.
          const name = username(data.username); const encoded = await passwordHash(data.password);
          checked(await auth.addAccount(user, name, encoded, data.admin === true));
          return json(res, 201, { ok: true });
        } finally { busy--; }
      }
      if (req.method === 'PUT' && /^\/api\/accounts\/\d+$/.test(path)) {
        const id = Number(path.split('/').pop()); const data = await body(req);
        if (!Number.isSafeInteger(id) || id < 1 || typeof data.active !== 'boolean') throw inputError('État invalide.');
        checked(await auth.setActive(user, id, data.active));
        return json(res, 200, { ok: true });
      }
      return await handler(req, res);
    } catch (error) {
      if (error?.code !== 'MANGER_ACCOUNT_INPUT') return json(res, 503, { error: 'Le service est temporairement indisponible. Aucune réussite n’a pu être confirmée.' });
      return json(res, error.status || 400, { error: error.message });
    }
  };
}

async function accountCommand(auth, command, name) {
  if (!['create-admin','reset-password'].includes(command) || !name) throw inputError('Usage : node accounts.js create-admin|reset-password identifiant');
  const normalized = username(name), password = randomBytes(18).toString('base64url');
  const encoded = await passwordHash(password);
  if (command === 'create-admin') checked(await auth.createLocalAccount(normalized, encoded));
  else checked(await auth.resetLocalPassword(normalized, encoded));
  return {username:normalized,password};
}

// Run locally on the server: no public registration or first-visitor administrator.
if (require.main === module) {
  (async () => {
    const [command, name] = process.argv.slice(2);
    if (!['create-admin', 'reset-password'].includes(command) || !name) throw new Error('Usage : node accounts.js create-admin|reset-password identifiant');
    if (storageEngine() === 'postgres') throw new Error('Les commandes PostgreSQL ne sont pas activées au lancement normal tant que la migration est incomplète. Aucune base SQLite ouverte.');
    const normalized = username(name); const db = openAccounts();
    try {
      const { password } = await accountCommand(sqliteAuth(db), command, normalized);
      console.log(`Identifiant : ${normalized}\nMot de passe généré : ${password}\nConserve-le dans ton gestionnaire de mots de passe. Ne le partage pas dans les journaux ou captures.`);
    } finally { db.close(); }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { accountPath, openAccounts, createAccount, protectAccounts, accountCommand };
