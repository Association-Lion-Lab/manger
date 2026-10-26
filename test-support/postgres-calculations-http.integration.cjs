const test=require('node:test');
const {createServer}=require('node:http');
const {databaseFixture}=require('./database');
const {postgresCalculations}=require('../db/calculations');
const {postgresPantry}=require('../db/pantry');
const {postgresAuth}=require('../db/auth');
const {openAccounts,createAccount,protectAccounts}=require('../accounts');
const {createCalculationHandler}=require('../server');
const {householdHttp}=require('./household-http');
const {calculationHttp}=require('./calculations-http');
test('calculs HTTP PostgreSQL réel protégés',{timeout:60000},async t=>{
  const {database:db}=await databaseFixture(t),legacy=openAccounts(':memory:');let failing=false;
  try{await createAccount(legacy,'member','long-password-member',false);const row=legacy.prepare('SELECT * FROM accounts').get();await db.query('INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,$3)',[row.username,row.password,row.admin]);}finally{legacy.close();}
  const calc=postgresCalculations({...db,transaction:work=>failing?db.query('SELECT private_password FROM household.absent'):db.transaction(work)});
  const server=createServer(protectAccounts(null,createCalculationHandler(calc,postgresPantry(db)),{auth:postgresAuth(db)}));
  await calculationHttp(t,{...await householdHttp(t,server),failDatabase(){failing=true;return()=>{failing=false;};}});
});
