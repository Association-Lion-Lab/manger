const test=require('node:test');
const {createApp,createDatabase}=require('./server');
const {openAccounts,createAccount}=require('./accounts');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {householdHttp}=require('./test-support/household-http');
const {extrasHttpContract}=require('./test-support/recipe-extras-http-contract');

test('enrichissements/imports : HTTP SQLite normal',async t=>{
  const db=createDatabase(':memory:'),accounts=openAccounts(':memory:'),store=sqliteRecipes(db);t.after(()=>{db.close();accounts.close();});
  db.exec('DELETE FROM recipes');await createAccount(accounts,'member','long-password-member',false);
  await extrasHttpContract(t,{...await householdHttp(t,createApp(db,accounts,null)),read:()=>JSON.parse(JSON.stringify(store.read())),
    failDatabase(){const prepare=db.prepare.bind(db);db.prepare=()=>{throw new Error('SELECT private password');};return()=>{db.prepare=prepare;};},
    seedLegacyIds(){db.exec("INSERT INTO recipes(id,title,minutes,servings,diet) VALUES(0,'Zero',1,1,'vegan'),(5000000001,'Large',1,1,'vegan')");}});
});
