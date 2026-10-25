const rules=require('../planning');
const {inputError,validateMealInput}=require('../meal');
function postgresPlanning(db,{write,read,references,saveIn,children}) {
  async function vacant(tx,meals){for(const meal of meals)if((await tx.query('SELECT 1 FROM household.meals WHERE date=$1 AND slot=$2',[meal.date,meal.slot])).rowCount)throw inputError('Un créneau de destination est déjà occupé. Aucun repas n’a été ajouté.');}
  async function copyIn(tx,source,start,target) {
    const meals=rules.copiedMeals(source,start,target,await references(tx));await vacant(tx,meals);
    const ids=new Map();for(const [i,meal] of meals.entries())ids.set(source[i].id,await saveIn(tx,meal,null));
    for(const meal of source)if(meal.leftoverOf!=null)await tx.query('UPDATE household.meals SET leftover_of=$1 WHERE id=$2',[ids.get(meal.leftoverOf),ids.get(meal.id)]);
    return meals.length;
  }
  const planWeek=input=>write(async tx=>{
    const meals=rules.planMeals(input,await references(tx));await vacant(tx,meals);for(const meal of meals)await saveIn(tx,meal,null);return meals.length;
  });
  const copyWeek=input=>{rules.validateCopy(input);return write(async tx=>{
    const source=await read(input.sourceStart,tx);if(input.sourceSnapshot!==JSON.stringify(source))throw inputError('La semaine source a changé. Recharge son aperçu.');
    return copyIn(tx,source,input.sourceStart,input.targetStart);
  });};
  const templates=async()=>(await db.query(`SELECT id::float8 AS id,name,created_at AS "createdAt",json_array_length(meals_json::json) AS "mealCount"
    FROM household.week_templates ORDER BY translate(name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') COLLATE "C",id`)).rows;
  async function saveTemplate(input) {
    const name=rules.templateName(input);
    try {return await write(async tx=>{
      const source=rules.checkedSource(await read(input.start,tx),input.start);
      if((await tx.query('SELECT COUNT(*)::int AS n FROM household.week_templates')).rows[0].n>=30)throw inputError('Tu peux conserver 30 semaines types maximum.');
      const {rows:[row]}=await tx.query('INSERT INTO household.week_templates(name,source_start,meals_json,created_at) VALUES($1,$2,$3,$4) RETURNING id::float8 AS id',[name,input.start,JSON.stringify(source),new Date().toISOString()]);
      return {id:row.id,name,mealCount:source.length};
    });}catch(error){if(error.code==='23505'&&error.cause?.constraint==='week_templates_name_key')throw inputError('Une semaine type porte déjà ce nom.');throw error;}
  }
  const applyTemplate=(id,input)=>{const target=rules.targetWeek(input);return write(async tx=>{
    const template=(await tx.query('SELECT source_start AS "sourceStart",meals_json AS "mealsJson" FROM household.week_templates WHERE id=$1',[id])).rows[0];
    if(!template)throw inputError('Semaine type inconnue.');return copyIn(tx,JSON.parse(template.mealsJson),template.sourceStart,target);
  });};
  const removeTemplate=id=>write(async tx=>{if(!(await tx.query('DELETE FROM household.week_templates WHERE id=$1 RETURNING id',[id])).rowCount)throw inputError('Semaine type inconnue.');return true;});
  async function get(tx,id){
    const row=(await tx.query('SELECT date FROM household.meals WHERE id=$1',[id])).rows[0];if(!row)throw inputError('Repas inconnu.');return (await read(row.date,tx,row.date)).find(meal=>meal.id===id);
  }
  const place=(id,input)=>{rules.validatePlacement(id,input);return write(async tx=>{
    const source=await get(tx,id),parent=source.leftoverOf==null?null:await get(tx,source.leftoverOf),rest=(await tx.query('SELECT date,slot FROM household.meals WHERE leftover_of=$1',[id])).rows;
    rules.checkPlacement(input,source,parent,rest);await vacant(tx,[input]);
    if(input.action==='copy')await saveIn(tx,validateMealInput({...source,date:input.date,slot:input.slot}),null);
    else await tx.query('UPDATE household.meals SET date=$1,slot=$2 WHERE id=$3',[input.date,input.slot,id]);
    return true;
  });};
  const leftovers=input=>{rules.validateLeftovers(input);return write(async tx=>{
    const source=await get(tx,input.sourceId),meal=rules.leftoverMeal(input,source);await vacant(tx,[meal]);
    const {rows:[row]}=await tx.query('INSERT INTO household.meals(date,slot,location,occasion,people,recipe_id,title,leftover_of) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::float8 AS id',[meal.date,meal.slot,meal.location,meal.occasion,meal.people,meal.recipeId,meal.title,source.id]);
    await children(tx,row.id,meal);return true;
  });};
  return {planWeek,copyWeek,templates,saveTemplate,applyTemplate,removeTemplate,place,leftovers};
}
module.exports={postgresPlanning};
