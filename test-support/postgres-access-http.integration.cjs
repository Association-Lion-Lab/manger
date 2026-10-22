const test=require('node:test');
const {databaseFixture}=require('./database');
const {postgresAuth}=require('../db/auth');
const {openAccounts,createAccount}=require('../accounts');
const {accessHttp}=require('./access-http');
const {accessContract}=require('./access-contract');
const {accessRaces}=require('./access-races');

test('contrat HTTP invitations et administration PostgreSQL', {timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,auth=postgresAuth(db),legacy=openAccounts(':memory:');
  try {
    for(const name of ['admin','member'])await createAccount(legacy,name,`long-password-${name}`,name==='admin');
    for(const row of legacy.prepare('SELECT * FROM accounts').all())await db.query('INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,$3)',[row.username,row.password,row.admin]);
  } finally {legacy.close();}
  await accessContract(t,{...await accessHttp(t,auth),auth,
    clearAttempts:()=>db.query('DELETE FROM auth.attempts'),expireInvitations:()=>db.query('UPDATE auth.invitations SET expires=0'),
    readInvitation:async()=>(await db.query('SELECT token FROM auth.invitations')).rows[0],
    allRows:()=>Promise.all(['accounts','sessions','invitations','attempts'].map(table=>db.query(`SELECT * FROM auth.${table}`)))});
  await accessRaces(t,{auth,clearAttempts:()=>db.query('DELETE FROM auth.attempts'),
    setAdmin:admin=>db.query("UPDATE auth.accounts SET admin=$1 WHERE username='admin'",[admin?1:0]),
    expireInvitations:()=>db.query('UPDATE auth.invitations SET expires=0')});
});
