const rules=require('../calculations');
const {sqliteRecipes}=require('./recipes-sqlite');
const {sqliteMeals}=require('./meals-sqlite');
const {sqliteHousehold}=require('./household-sqlite');
const {itemQuery}=require('./calculation-items');
function sqliteSnapshot(db){
  return {
    recipes:sqliteRecipes(db).read(),home:sqliteHousehold(db).read(),
    meals:sqliteMeals(db).read('0000-01-01','9999-12-31'),items:db.prepare(itemQuery('sqlite')).all(),
    stocks:db.prepare('SELECT id,name,unit,amount,explicit_lot AS explicitLot,recorded_on AS recordedOn,use_by AS useBy FROM pantry ORDER BY use_by IS NULL,use_by,recorded_on,id').all()
  };
}
function sqliteCalculations(db){
  function calculate(method,args){
    const own=!db.isTransaction;if(own)db.exec('BEGIN');
    try{const result=rules[method](sqliteSnapshot(db),...args);if(own)db.exec('COMMIT');return result;}
    catch(error){if(own)db.exec('ROLLBACK');throw error;}
  }
  return Object.freeze({pantry:(...args)=>calculate('pantry',args),shoppingList:(...args)=>calculate('shoppingList',args),
    pantryShopping:(...args)=>calculate('pantryShopping',args),suggestions:(...args)=>calculate('suggestions',args),preview:(...args)=>calculate('previewMenu',args)});
}
module.exports={sqliteSnapshot,sqliteCalculations};
