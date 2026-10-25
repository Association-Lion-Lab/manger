const test=require('node:test');
const {databaseFixture}=require('./database');
const {postgresMeals}=require('../db/meals');
const {postgresHousehold}=require('../db/household');
const {postgresRecipes}=require('../db/recipes');
const {mealStoreContract}=require('./meal-store');
test('contrat repas PostgreSQL réel',{timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database;
  await mealStoreContract(t,{store:postgresMeals(db),home:postgresHousehold(db),recipes:postgresRecipes(db),
    linkRest:(id,date,people)=>db.query("INSERT INTO household.meals(date,slot,location,occasion,people,title,leftover_of) VALUES($1,'midi','home','regular',$2,'Restes',$3)",[date,people,id])});
});
