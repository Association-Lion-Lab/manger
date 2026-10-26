const test=require('node:test');
const {createServer}=require('node:http');
const {createDatabase,createCalculationHandler}=require('./server');
const {sqliteCalculations}=require('./db/calculations-sqlite');
const {sqlitePantry}=require('./db/pantry-sqlite');
const {openAccounts,createAccount,protectAccounts}=require('./accounts');
const {householdHttp}=require('./test-support/household-http');
const {calculationHttp}=require('./test-support/calculations-http');
test('calculs HTTP SQLite protégés',async t=>{
  const db=createDatabase(':memory:'),accounts=openAccounts(':memory:');t.after(()=>{accounts.close();db.close();});
  await createAccount(accounts,'member','long-password-member',false);let failing=false;
  const calc=sqliteCalculations(db),store={...calc,pantry:()=>{if(failing)db.prepare('SELECT private_password FROM absent').all();return calc.pantry();}};
  const server=createServer(protectAccounts(accounts,createCalculationHandler(store,sqlitePantry(db))));
  await calculationHttp(t,{...await householdHttp(t,server),failDatabase(){failing=true;return()=>{failing=false;};}});
});
