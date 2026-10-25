const test=require('node:test');
const {createApp,createDatabase}=require('./server');
const {openAccounts,createAccount}=require('./accounts');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {householdHttp}=require('./test-support/household-http');
const {recipeContract}=require('./test-support/recipe-http-contract');

test('contrat HTTP recettes SQLite normal',async t=>{
  const db=createDatabase(':memory:'),accounts=openAccounts(':memory:'),store=sqliteRecipes(db);t.after(()=>{db.close();accounts.close();});
  db.exec('DELETE FROM recipes');await createAccount(accounts,'member','long-password-member',false);
  await recipeContract(t,{...await householdHttp(t,createApp(db,accounts,null)),read:()=>JSON.parse(JSON.stringify(store.read())),
    failWrite(){const prepare=db.prepare.bind(db);db.prepare=()=>{throw new Error('SELECT private password');};return()=>{db.prepare=prepare;};},
    seedPlanning(parent,dish){db.exec("INSERT INTO members(id,name,diet) VALUES(1,'Fixture','vegetarian')");
      db.prepare("INSERT INTO meals(id,date,slot,location,occasion,people,title,recipe_id) VALUES(1,'2026-10-25','midi','home','regular',2,'Avant',?)").run(parent);
      db.prepare('INSERT INTO meal_dishes(meal_id,member_id,recipe_id,portions,protein_id) VALUES(1,1,?,1,NULL)').run(dish);},
    mealTitle:()=>db.prepare('SELECT title FROM meals WHERE id=1').get().title,
    clearPlanning(){db.exec('DELETE FROM meals; DELETE FROM members');},
    seedLegacyIds(){db.exec("INSERT INTO recipes(id,title,minutes,servings,diet) VALUES(0,'Zero',1,1,'vegan'),(5000000001,'Large',1,1,'vegan')");}});
});
