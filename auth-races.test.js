const test = require('node:test');
const { openAccounts, createAccount } = require('./accounts');
const { sqliteAuth } = require('./db/auth-sqlite');
const { raceContract } = require('./test-support/auth-races');

test('courses HTTP pendant scrypt sur SQLite', {timeout:20000},async t=>{
  const db=openAccounts(':memory:');t.after(()=>db.close());
  await createAccount(db,'admin','long-password-admin',true);
  await raceContract(t,{auth:sqliteAuth(db),clearAttempts:()=>db.exec('DELETE FROM attempts'),
    setActive:active=>db.prepare('UPDATE accounts SET active=?').run(active?1:0),
    readPassword:()=>db.prepare('SELECT password FROM accounts').get().password,
    setPassword:password=>db.prepare('UPDATE accounts SET password=?').run(password),revokeSessions:()=>db.exec('DELETE FROM sessions')});
});
