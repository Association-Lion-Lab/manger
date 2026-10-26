const {TABLES,kind}=require('./migration-format');
const {transferError}=require('./migration-verify');
const order=['household.recipes','household.ingredients','household.members','household.proteins','household.recipe_ingredients','household.recipe_steps','household.meals','household.meal_assignments','household.meal_dishes','household.shopping_checks','household.shopping_manual','household.shopping_aisles','household.recipe_favorites','household.avoided_ingredients','household.recipe_photos','household.pantry','household.recipe_notes','household.week_templates','auth.accounts','auth.sessions','auth.attempts','auth.invitations'];
async function lockTables(tx,{includeAuth=true}={}){
  await tx.query(`LOCK TABLE ${TABLES.filter(t=>includeAuth||t.schema==='household').map(t=>t.key).join(',')} IN ACCESS EXCLUSIVE MODE`);
}
async function insertTables(tx,data,{includeAuth=true}={}){
  for(const key of order.filter(key=>includeAuth||key.startsWith('household.'))){
    const table=TABLES.find(t=>t.key===key),rows=data[key];if(!rows.length)continue;
    const types=table.columns.map(c=>({binary:'bytea',integer:'bigint',number:'double precision',text:'text'})[kind(table,c)]);
    const placeholders=types.map((type,i)=>`$${i+1}::${type}[]`);
    await tx.query(`INSERT INTO ${key}(${table.columns.map(c=>'"'+c+'"').join(',')}) SELECT * FROM unnest(${placeholders.join(',')})`,table.columns.map(c=>rows.map(row=>row[c])));
  }
}
function sequenceStarts(data,{includeAuth=true}={}){
  const starts=[];
  for(const table of TABLES.filter(t=>(includeAuth||t.schema==='household')&&t.name!=='invitations')){
    const column=table.name==='shopping_aisles'?'sort_order':table.columns.includes('id')?'id':null;if(!column)continue;
    const max=data[table.key].reduce((value,row)=>Math.max(value,row[column]),0),next=max+1;
    if(!Number.isSafeInteger(next))throw transferError();
    starts.push({sequence:`${table.schema}.${table.name}_${column}_seq`,next});
  }
  return starts;
}
async function restartSequences(tx,data,options){
  // All identifiers come from the fixed schema contract; RESTART rolls back with the import.
  for(const {sequence,next} of sequenceStarts(data,options))await tx.query(`ALTER SEQUENCE ${sequence} RESTART WITH ${next}`);
}
module.exports={lockTables,insertTables,restartSequences,sequenceStarts,householdOrder:Object.freeze(order.filter(k=>k.startsWith('household.')))};
