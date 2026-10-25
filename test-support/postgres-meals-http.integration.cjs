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
const {mealHttpContract}=require('./meal-http-contract');
test('repas HTTP PostgreSQL réel protégé',{timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,legacy=openAccounts(':memory:');let failing=false;
  try {await createAccount(legacy,'member','long-password-member',false);const row=legacy.prepare('SELECT * FROM accounts').get();await db.query('INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,$3)',[row.username,row.password,row.admin]);}finally{legacy.close();}
  const failure=()=>db.query('SELECT private_password FROM household.absent');
  const store=postgresMeals({...db,query:(...args)=>failing?failure():db.query(...args),transaction:work=>failing?failure():db.transaction(work)});
  const server=createServer(protectAccounts(null,createMealHandler(store),{auth:postgresAuth(db)}));
  try {
    const http=await householdHttp(t,server);
    await mealHttpContract(t,{...http,store,home:postgresHousehold(db),recipes:postgresRecipes(db),failDatabase(){failing=true;return()=>{failing=false;};},
      async seedLegacyIds(){for(const id of [0,5000000001]){
        await db.query("INSERT INTO household.recipes(id,title,minutes,servings,diet) VALUES($1,$2,10,1,'vegan')",[id,'ID '+id]);
        await db.query("INSERT INTO household.members(id,name,diet) VALUES($1,$2,'omnivore')",[id,'ID '+id]);
        await db.query("INSERT INTO household.proteins(id,name,category,amount,unit) VALUES($1,$2,'plant',1,'g')",[id,'ID '+id]);
        await db.query("INSERT INTO household.meals(id,date,slot,location,occasion,people,title) VALUES($1,$2,'midi','home','regular',1,'ID')",[id,id===0?'2026-11-09':'2026-11-10']);
      }}});
    await t.test('autres parcours fermés, sans repli SQLite',async()=>{
      const cookie=await http.login();for(const path of ['/api/week?start=2026-10-26','/api/shopping?start=2026-10-26','/api/household'])assert.equal((await http.request(path,'GET',undefined,cookie)).status,503);
    });
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
