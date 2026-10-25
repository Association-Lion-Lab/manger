const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {databaseFixture}=require('./database');
const {postgresRecipes}=require('../db/recipes');
const {postgresAuth}=require('../db/auth');
const {createRecipeHandler}=require('../server');
const {openAccounts,createAccount,protectAccounts}=require('../accounts');
const {householdHttp}=require('./household-http');
const {recipeContract}=require('./recipe-http-contract');

test('contrat HTTP recettes PostgreSQL réel protégé',{timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,legacy=openAccounts(':memory:');let failing=false;
  try {await createAccount(legacy,'member','long-password-member',false);const row=legacy.prepare('SELECT * FROM accounts').get();
    await db.query('INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,$3)',[row.username,row.password,row.admin]);
  } finally {legacy.close();}
  const store=postgresRecipes({...db,transaction:work=>db.transaction(tx=>failing?tx.query('SELECT private_password FROM household.nonexistent'):work(tx))});
  const server=createServer(protectAccounts(null,createRecipeHandler(store),{auth:postgresAuth(db)})),http=await householdHttp(t,server);
  await recipeContract(t,{...http,read:store.read,failWrite(){failing=true;return()=>{failing=false;};},
    async seedPlanning(parent,dish){await db.query("INSERT INTO household.members(id,name,diet) VALUES(1,'Fixture','vegetarian')");
      await db.query("INSERT INTO household.meals(id,date,slot,location,occasion,people,title,recipe_id) VALUES(1,'2026-10-25','midi','home','regular',2,'Avant',$1)",[parent]);
      await db.query('INSERT INTO household.meal_dishes(meal_id,member_id,recipe_id,portions,protein_id) VALUES(1,1,$1,1,NULL)',[dish]);},
    mealTitle:async()=>(await db.query('SELECT title FROM household.meals WHERE id=1')).rows[0].title,
    async clearPlanning(){await db.query('DELETE FROM household.meals');await db.query('DELETE FROM household.members');},
    async seedLegacyIds(){await db.query("INSERT INTO household.recipes(id,title,minutes,servings,diet) VALUES(0,'Zero',1,1,'vegan'),(5000000001,'Large',1,1,'vegan')");}});
  const cookie=await http.login();
  for(const [path,method] of [['/api/recipes','GET'],['/api/week','GET'],['/api/recipes/1/photo','GET'],['/api/recipes/1/favorite','PUT'],['/api/catalog/import','POST']])assert.equal((await http.request(path,method,method==='GET'?undefined:{},cookie)).status,503);
});
