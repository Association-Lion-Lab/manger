const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {databaseFixture}=require('./database');
const {postgresMeals}=require('../db/meals');
const {postgresHousehold}=require('../db/household');
const {postgresRecipes}=require('../db/recipes');
const {postgresAuth}=require('../db/auth');
const {openAccounts,createAccount,protectAccounts}=require('../accounts');
const {createMealHandler}=require('../server');
const {householdHttp}=require('./household-http');
const {planningHttpContract}=require('./planning-http-contract');
test('planning HTTP PostgreSQL réel protégé',{timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,legacy=openAccounts(':memory:');let failing=false;
  try {await createAccount(legacy,'member','long-password-member',false);const row=legacy.prepare('SELECT * FROM accounts').get();await db.query('INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,$3)',[row.username,row.password,row.admin]);}finally{legacy.close();}
  const failure=()=>db.query('SELECT private_password FROM household.absent');
  const store=postgresMeals({...db,query:(...args)=>failing?failure():db.query(...args),transaction:work=>failing?failure():db.transaction(work)});
  const server=createServer(protectAccounts(null,createMealHandler(store),{auth:postgresAuth(db)}));
  try {
    const http=await householdHttp(t,server);
    await planningHttpContract(t,{...http,store,home:postgresHousehold(db),recipes:postgresRecipes(db),failDatabase(){failing=true;return()=>{failing=false;};},
      async seedTemplateIds(snapshot,start){for(const id of [0,5000000001])await db.query('INSERT INTO household.week_templates(id,name,source_start,meals_json,created_at) VALUES($1,$2,$3,$4,$5)',[id,'ID '+id,start,snapshot,'2026-10-25T12:00:00.000Z']);}});
    await t.test('calculs et lecture agrégée non portés refusés sans repli',async()=>{
      const cookie=await http.login();for(const path of ['/api/week?start=2026-11-02','/api/shopping?start=2026-11-02','/api/suggestions'])assert.equal((await http.request(path,'GET',undefined,cookie)).status,503);
    });
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
