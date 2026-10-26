const test=require('node:test');
const {createDatabase}=require('./server');
const {sqliteCalculations}=require('./db/calculations-sqlite');
const {sqlitePantry}=require('./db/pantry-sqlite');
const {sqliteHousehold}=require('./db/household-sqlite');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {sqliteMeals}=require('./db/meals-sqlite');
const {calculationContract}=require('./test-support/calculations-contract');
test('placard et calculs SQLite partagés',async t=>{
  const db=createDatabase(':memory:');t.after(()=>db.close());db.exec('DELETE FROM recipes; DELETE FROM members; DELETE FROM proteins');
  await calculationContract(t,{calc:sqliteCalculations(db),pantry:sqlitePantry(db),home:sqliteHousehold(db),recipes:sqliteRecipes(db),meals:sqliteMeals(db)});
});
