const rules=require('../calculations');
const {postgresRecipes}=require('./recipes');
const {postgresMeals}=require('./meals');
const {postgresHousehold}=require('./household');
const {itemQuery}=require('./calculation-items');
async function postgresSnapshot(tx){
  const recipes=await postgresRecipes(tx).read(),home=await postgresHousehold(tx).read();
  const meals=await postgresMeals(tx).read('0000-01-01',tx,'9999-12-31');
  const items=(await tx.query(itemQuery('postgres'))).rows;
  const stocks=(await tx.query('SELECT id::float8 AS id,name,unit,amount,explicit_lot AS "explicitLot",recorded_on AS "recordedOn",use_by AS "useBy" FROM household.pantry ORDER BY use_by IS NULL,use_by,recorded_on,id')).rows;
  return {recipes,home,meals,items,stocks};
}
function postgresCalculations(db){
  const calculate=(method,args)=>db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return rules[method](await postgresSnapshot(tx),...args);
  });
  return Object.freeze({pantry:(...args)=>calculate('pantry',args),shoppingList:(...args)=>calculate('shoppingList',args),
    pantryShopping:(...args)=>calculate('pantryShopping',args),suggestions:(...args)=>calculate('suggestions',args),preview:(...args)=>calculate('previewMenu',args)});
}
module.exports={postgresSnapshot,postgresCalculations};
