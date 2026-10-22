const test = require('node:test');
const { openAccounts,createAccount } = require('./accounts');
const { sqliteAuth } = require('./db/auth-sqlite');
const { accessHttp } = require('./test-support/access-http');
const { accessContract } = require('./test-support/access-contract');
const { accessRaces } = require('./test-support/access-races');

test('contrat HTTP invitations et administration SQLite',async t=>{
  const db=openAccounts(':memory:');t.after(()=>db.close());
  await createAccount(db,'admin','long-password-admin',true);await createAccount(db,'member','long-password-member');
  const auth=sqliteAuth(db);
  await accessContract(t,{...await accessHttp(t,auth),auth,
    clearAttempts:()=>db.exec('DELETE FROM attempts'),expireInvitations:()=>db.exec('UPDATE invitations SET expires=0'),
    readInvitation:()=>db.prepare('SELECT token FROM invitations').get(),
    allRows:()=>['accounts','sessions','invitations','attempts'].map(table=>db.prepare(`SELECT * FROM ${table}`).all())});
});

test('courses de droits et invitations SQLite',async t=>{
  const db=openAccounts(':memory:');t.after(()=>db.close());await createAccount(db,'admin','long-password-admin',true);
  await accessRaces(t,{auth:sqliteAuth(db),clearAttempts:()=>db.exec('DELETE FROM attempts'),
    setAdmin:admin=>db.prepare('UPDATE accounts SET admin=?').run(admin?1:0),expireInvitations:()=>db.exec('UPDATE invitations SET expires=0')});
});
