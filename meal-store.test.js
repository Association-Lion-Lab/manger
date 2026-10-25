const test=require('node:test');
const {createDatabase}=require('./server');
const {sqliteMeals}=require('./db/meals-sqlite');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {sqliteHousehold}=require('./db/household-sqlite');
const {mealStoreContract}=require('./test-support/meal-store');
test('contrat repas SQLite',async t=>{
  const db=createDatabase(':memory:');t.after(()=>db.close());
  await mealStoreContract(t,{store:sqliteMeals(db),home:sqliteHousehold(db),recipes:sqliteRecipes(db),
    linkRest:(id,date,people)=>db.prepare("INSERT INTO meals(date,slot,location,occasion,people,title,leftover_of) VALUES(?,'midi','home','regular',?,'Restes',?)").run(date,people,id)});
});
