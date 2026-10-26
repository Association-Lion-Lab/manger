const test=require('node:test');
const {createDatabase}=require('./server');
const {sqliteShopping}=require('./db/shopping-sqlite');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {sqliteMeals}=require('./db/meals-sqlite');
const {shoppingContract}=require('./test-support/shopping-contract');
test('courses éditables SQLite partagées',async t=>{
  const db=createDatabase(':memory:');t.after(()=>db.close());db.exec('DELETE FROM recipes; DELETE FROM members');
  await shoppingContract(t,{store:sqliteShopping(db),recipes:sqliteRecipes(db),meals:sqliteMeals(db)});
});
