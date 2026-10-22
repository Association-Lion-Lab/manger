const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseFixture } = require('./database');
const { postgresAuth } = require('../db/auth');
const { openPostgres } = require('../db/postgres');

const DAY = 86400000;
test('dépôt PostgreSQL connexion/sessions', { timeout: 60000 }, async t => {
  const fixture = await databaseFixture(t), db = fixture.database, auth = postgresAuth(db);
  const id = 5000000001, password = 'synthetic-encoded-password';
  await db.query('INSERT INTO auth.accounts(id,username,password,admin) VALUES($1,$2,$3,1)', [id, 'admin', password]);
  const user = await auth.findUser('admin');

  await t.test('identifiants numériques sûrs, mêmes champs et aucun amorçage', async () => {
    assert.deepEqual(user, { id, username:'admin', password, admin:1, active:1 });
    assert.equal(await auth.findUser('unknown'), undefined);
    assert.equal(await auth.findUser('unknown\0'), undefined);
  });
  await t.test('session hachée, expiration absolue, compte désactivé et jeton inconnu refusés', async () => {
    const before = Date.now();
    assert.equal(await auth.startSession(user, 'synthetic-hashed-token'), true);
    const row = await auth.session('synthetic-hashed-token');
    assert.equal(row.id, id); assert.equal(row.token, 'synthetic-hashed-token');
    const expiry = Number((await db.query('SELECT expires FROM auth.sessions')).rows[0].expires);
    assert.ok(expiry >= before + 7 * DAY && expiry <= Date.now() + 7 * DAY);
    assert.equal(await auth.session('unknown'), undefined);
    await db.query('UPDATE auth.accounts SET active=0 WHERE id=$1', [id]);
    assert.equal(await auth.session(row.token), undefined);
    assert.equal(await auth.startSession(user, 'disabled'), false);
    await db.query('UPDATE auth.accounts SET active=1 WHERE id=$1', [id]);
    await db.query('UPDATE auth.sessions SET expires=0');
    assert.equal(await auth.session(row.token), undefined);
  });
  await t.test('mot de passe modifié après lecture : ancienne preuve de connexion inutilisable', async () => {
    await db.query('UPDATE auth.accounts SET password=$1 WHERE id=$2', ['reset', id]);
    assert.equal(await auth.startSession(user, 'stale'), false);
    await db.query('UPDATE auth.accounts SET password=$1 WHERE id=$2', [password, id]);
  });
  await t.test('déconnexion ciblée ou globale limitée au compte courant', async () => {
    await auth.startSession(user, 'first'); await auth.startSession(user, 'second');
    await db.query('INSERT INTO auth.accounts(id,username,password) VALUES(2,$1,$2)', ['member', password]);
    const other = await auth.findUser('member'); await auth.startSession(other, 'other');
    await auth.logout({ ...user, token:'first' }, false);
    assert.equal(await auth.session('first'), undefined); assert.ok(await auth.session('second'));
    await auth.logout(user, true);
    assert.equal(await auth.session('second'), undefined); assert.ok(await auth.session('other'));
  });
  await t.test('changement de mot de passe et révocation atomiques, session supprimée ou expirée refuse', async () => {
    await auth.startSession(user, 'password-session');
    assert.equal(await auth.changePassword({ ...user, token:'missing' }, 'must-not-apply'), false);
    await db.query('UPDATE auth.sessions SET expires=0 WHERE token=$1', ['password-session']);
    assert.equal(await auth.changePassword({ ...user, token:'password-session' }, 'must-not-apply'), false);
    await auth.startSession(user, 'password-session-new'); await auth.startSession(user, 'another');
    assert.equal(await auth.changePassword({ ...user, token:'password-session-new' }, 'replacement'), true);
    assert.equal((await auth.findUser('admin')).password, 'replacement');
    assert.equal(await auth.session('another'), undefined);
    assert.ok(await auth.session('other'));
    await db.query('UPDATE auth.accounts SET password=$1 WHERE id=$2', [password, id]);
  });
  await t.test('tentatives atomiques entre deux pools, aucun compteur partiellement incrémenté', async () => {
    const second = await openPostgres(fixture.config), other = postgresAuth(second);
    try {
      const keys = [['global',60],['ip:synthetic',20],['name:synthetic',8]];
      const results = await Promise.all(Array.from({ length:18 }, (_, index) => (index % 2 ? auth : other).throttle(keys)));
      assert.equal(results.filter(Boolean).length, 8);
      assert.deepEqual((await db.query('SELECT count FROM auth.attempts ORDER BY key')).rows.map(row => row.count), [8,8,8]);
      await db.query('UPDATE auth.attempts SET expires=0');
      assert.equal(await auth.throttle(keys), true);
      assert.deepEqual((await db.query('SELECT count FROM auth.attempts')).rows.map(row => row.count), [1,1,1]);
    } finally { await second.close(); }
  });
});
