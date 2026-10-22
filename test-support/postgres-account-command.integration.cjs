const test=require('node:test');
const assert=require('node:assert/strict');
const {databaseFixture}=require('./database');
const {postgresAuth}=require('../db/auth');
const {commandContract}=require('./account-command-contract');

test('commandes locales de récupération sur PostgreSQL réel', {timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,auth=postgresAuth(db);
  await commandContract(t,{auth,
    seedMember:encoded=>db.query("INSERT INTO auth.accounts(username,password) VALUES('member',$1)",[encoded]),
    disableMember:()=>db.query("UPDATE auth.accounts SET active=0 WHERE username='member'")});
  await t.test('échec de révocation après réinitialisation : mot de passe et sessions restaurés',async()=>{
    const before=await auth.findUser('admin');await auth.startSession(before,'rollback-reset');
    const broken=postgresAuth({...db,transaction:work=>db.transaction(tx=>work({...tx,query:(sql,values)=>
      tx.query(sql==='DELETE FROM auth.sessions WHERE account_id=$1'?'SELECT 1/0':sql,sql==='DELETE FROM auth.sessions WHERE account_id=$1'?[]:values)}))});
    await assert.rejects(broken.resetLocalPassword('admin','must-not-apply'),{code:'22012'});
    assert.equal((await auth.findUser('admin')).password,before.password);assert.ok(await auth.session('rollback-reset'));
  });
});
