const test=require('node:test');
const {createServer}=require('node:http');
const {createApp,createDatabase}=require('./server');
const {openAccounts,createAccount}=require('./accounts');
const {householdHttp}=require('./test-support/household-http');
const {shoppingHttpContract}=require('./test-support/shopping-http-contract');
test('courses HTTP SQLite normales protégées',async t=>{
  const db=createDatabase(':memory:'),accounts=openAccounts(':memory:');t.after(()=>{accounts.close();db.close();});await createAccount(accounts,'member','long-password-member',false);
  const server=createApp(db,accounts);let rename=false;
  await shoppingHttpContract(t,{...await householdHttp(t,server),failDatabase(){db.exec('ALTER TABLE pantry RENAME TO hidden_pantry');rename=true;return()=>{if(rename){db.exec('ALTER TABLE hidden_pantry RENAME TO pantry');rename=false;}};}});
});
