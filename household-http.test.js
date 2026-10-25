const test=require('node:test');
const {createApp,createDatabase}=require('./server');
const {openAccounts,createAccount}=require('./accounts');
const {householdHttp}=require('./test-support/household-http');
const {householdContract}=require('./test-support/household-contract');

test('contrat HTTP foyer SQLite normal',async t=>{
  const db=createDatabase(':memory:'),accounts=openAccounts(':memory:');t.after(()=>{db.close();accounts.close();});
  db.exec('DELETE FROM proteins'); // The normal SQLite initializer seeds proteins; this contract starts empty.
  await createAccount(accounts,'member','long-password-member',false);
  await householdContract(t,{...await householdHttp(t,createApp(db,accounts,null)),
    failRead(){const prepare=db.prepare.bind(db);db.prepare=()=>{throw new Error('SELECT private password');};return()=>{db.prepare=prepare;};},
    seedLargeIds(){db.exec("INSERT INTO members(id,name,diet) VALUES(5000000001,'Large','vegan'); INSERT INTO proteins(id,name,category,amount,unit) VALUES(5000000002,'large','plant',1,'g')");}});
});
