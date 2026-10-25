const test=require('node:test');
const {databaseFixture}=require('./database');
const {postgresMeals}=require('../db/meals');
const {postgresHousehold}=require('../db/household');
const {postgresRecipes}=require('../db/recipes');
const {weekStoreContract,placementStoreContract}=require('./planning-store');
const {planningIntegrity}=require('./postgres-planning-integrity');
test('semaines et copies PostgreSQL réel',{timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database;
  const store=postgresMeals(db),home=postgresHousehold(db);const ids=await weekStoreContract(t,{store,home,recipes:postgresRecipes(db)});
  await placementStoreContract(t,{store,home,ids,seedZeroSource:recipeId=>db.query("INSERT INTO household.meals(id,date,slot,location,occasion,people,recipe_id,title) VALUES(0,'2027-02-01','midi','home','regular',2,$1,'Zéro')",[recipeId])});
  await planningIntegrity(t,{f,store,home,ids});
});
