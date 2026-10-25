const test=require('node:test');
const {createDatabase,createApp}=require('./server');
const {sqliteMeals}=require('./db/meals-sqlite');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {sqliteHousehold}=require('./db/household-sqlite');
const {openAccounts,createAccount}=require('./accounts');
const {householdHttp}=require('./test-support/household-http');
const {mealHttpContract}=require('./test-support/meal-http-contract');
test('repas HTTP SQLite normal protégé',async t=>{
  const db=createDatabase(':memory:'),accounts=openAccounts(':memory:');t.after(()=>{db.close();accounts.close();});
  await createAccount(accounts,'member','long-password-member',false);const server=createApp(db,accounts,null);
  try {await mealHttpContract(t,{...await householdHttp(t,server),store:sqliteMeals(db),home:sqliteHousehold(db),recipes:sqliteRecipes(db),
    failDatabase(){const prepare=db.prepare.bind(db);db.prepare=()=>{throw Error('SELECT private password');};return()=>{db.prepare=prepare;};},
    seedLegacyIds(){for(const id of [0,5000000001]){
      db.prepare('INSERT INTO recipes(id,title,minutes,servings,diet) VALUES(?,?,10,1,?)').run(id,'ID '+id,'vegan');
      db.prepare('INSERT INTO members(id,name,diet) VALUES(?,?,?)').run(id,'ID '+id,'omnivore');
      db.prepare('INSERT INTO proteins(id,name,category,amount,unit) VALUES(?,?,?,1,?)').run(id,'ID '+id,'plant','g');
      db.prepare("INSERT INTO meals(id,date,slot,location,occasion,people,title) VALUES(?,?,'midi','home','regular',1,'ID')").run(id,id===0?'2026-11-09':'2026-11-10');
    }}});} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
