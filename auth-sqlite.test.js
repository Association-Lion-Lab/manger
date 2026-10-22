const test = require('node:test');
const assert = require('node:assert/strict');
const { openAccounts } = require('./accounts');
const { sqliteAuth } = require('./db/auth-sqlite');

test('dépôt SQLite : lecture, session et ancienne preuve refusée après réinitialisation', t => {
  const db = openAccounts(':memory:'); t.after(() => db.close());
  db.prepare('INSERT INTO accounts(username,password,admin) VALUES(?,?,1)').run('admin','synthetic-hash');
  const auth = sqliteAuth(db), user = auth.findUser('admin');
  assert.equal(auth.engine, 'sqlite'); assert.equal(auth.session('missing'), undefined);
  assert.equal(auth.startSession(user, 'synthetic-token'), true);
  assert.equal(auth.session('synthetic-token').id, user.id);
  db.prepare('UPDATE accounts SET password=?').run('reset');
  assert.equal(auth.startSession(user, 'stale'), false);
  assert.equal(auth.changePassword({ ...user,token:'synthetic-token' }, 'must-not-apply'), false);
});

test('dépôt SQLite : échec de révocation après UPDATE annule aussi le mot de passe', t => {
  const db = openAccounts(':memory:'); t.after(() => db.close());
  db.prepare('INSERT INTO accounts(username,password) VALUES(?,?)').run('admin','synthetic-hash');
  const auth = sqliteAuth(db), user = auth.findUser('admin'); auth.startSession(user,'synthetic-token');
  const broken = sqliteAuth({ exec:sql=>db.exec(sql), prepare(sql) {
    if (sql === 'DELETE FROM sessions WHERE account_id=?') throw new Error('synthetic-revocation-failure');
    return db.prepare(sql);
  } });
  assert.throws(() => broken.changePassword({ ...user,token:'synthetic-token' }, 'replacement'), /synthetic-revocation-failure/);
  assert.equal(auth.findUser('admin').password, user.password); assert.ok(auth.session('synthetic-token'));
});

test('dépôt SQLite : plafonds inchangés, aucune incrémentation partielle après refus', t => {
  const db = openAccounts(':memory:'); t.after(() => db.close());
  const auth = sqliteAuth(db), keys = [['global',60],['ip:test',20],['name:test',8]];
  for (let i=0;i<8;i++) assert.equal(auth.throttle(keys), true);
  assert.equal(auth.throttle(keys), false);
  assert.deepEqual(db.prepare('SELECT count FROM attempts ORDER BY key').all().map(row=>row.count), [8,8,8]);
});

test('dépôt SQLite : déconnexion différée avec jeton révoqué sans effet sur une session neuve', t => {
  const db=openAccounts(':memory:');t.after(()=>db.close());
  db.prepare('INSERT INTO accounts(username,password) VALUES(?,?)').run('admin','synthetic-hash');
  const auth=sqliteAuth(db),user=auth.findUser('admin');auth.startSession(user,'old');
  const stale=auth.session('old');auth.logout(stale,false);auth.startSession(user,'new');
  assert.equal(auth.logout(stale,true),false);assert.ok(auth.session('new'));
});
