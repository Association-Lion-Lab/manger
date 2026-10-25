const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {databaseFixture}=require('./database');
const {postgresHousehold}=require('../db/household');
const {postgresAuth}=require('../db/auth');
const {createHouseholdHandler}=require('../server');
const {openAccounts,createAccount,protectAccounts}=require('../accounts');
const {householdHttp}=require('./household-http');
const {householdContract}=require('./household-contract');

test('contrat HTTP foyer PostgreSQL réel protégé', {timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,legacy=openAccounts(':memory:');let readFails=false;
  try {
    await createAccount(legacy,'member','long-password-member',false);
    const row=legacy.prepare('SELECT * FROM accounts').get();
    await db.query('INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,$3)',[row.username,row.password,row.admin]);
  } finally {legacy.close();}
  const home=postgresHousehold({...db,query:(...args)=>readFails?db.query('SELECT private_password FROM household.nonexistent'):db.query(...args)});
  const server=createServer(protectAccounts(null,createHouseholdHandler(home),{auth:postgresAuth(db)}));
  const http=await householdHttp(t,server);
  await householdContract(t,{...http,
    failRead(){readFails=true;return()=>{readFails=false;};},
    async seedLargeIds(){
      await db.query("INSERT INTO household.members(id,name,diet) VALUES(0,'Zero','vegan'),(5000000001,'Large','vegan')");
      await db.query("INSERT INTO household.proteins(id,name,category,amount,unit) VALUES(0,'zero','plant',1,'g'),(5000000002,'large','plant',1,'g')");
    }});
  const cookie=await http.login();
  for(const path of ['/api/week','/api/recipes'])assert.equal((await http.request(path,'GET',undefined,cookie)).status,503);
  assert.equal((await http.request('/api/backup','GET',undefined,cookie)).status,403);
});
