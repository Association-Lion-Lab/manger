const test=require('node:test');
const {createDatabase}=require('./server');
const {sqliteMeals}=require('./db/meals-sqlite');
const {sqliteHousehold}=require('./db/household-sqlite');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {weekStoreContract,placementStoreContract}=require('./test-support/planning-store');
test('semaines et copies SQLite',async t=>{
  const db=createDatabase(':memory:');t.after(()=>db.close());
  const store=sqliteMeals(db),home=sqliteHousehold(db);const ids=await weekStoreContract(t,{store,home,recipes:sqliteRecipes(db)});
  await placementStoreContract(t,{store,home,ids,seedZeroSource:recipeId=>db.prepare("INSERT INTO meals(id,date,slot,location,occasion,people,recipe_id,title) VALUES(0,'2027-02-01','midi','home','regular',2,?,'Zéro')").run(recipeId)});
});
