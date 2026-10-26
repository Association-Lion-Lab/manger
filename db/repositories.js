const {postgresAuth}=require('./auth');
const {postgresHousehold}=require('./household');
const {postgresRecipes}=require('./recipes');
const {postgresMeals}=require('./meals');
const {postgresPantry}=require('./pantry');
const {postgresCalculations}=require('./calculations');
const {postgresShopping}=require('./shopping');
function postgresRepositories(db){
  return {auth:postgresAuth(db),home:postgresHousehold(db),recipes:postgresRecipes(db),meals:postgresMeals(db),pantry:postgresPantry(db),calc:postgresCalculations(db),shopping:postgresShopping(db)};
}
module.exports={postgresRepositories};
