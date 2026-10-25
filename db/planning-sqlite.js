const rules=require('../planning');
const {inputError,validateMealInput,checkMealReferences}=require('../meal');
function sqlitePlanning(db,{write,read,references,saveIn,children}) {
  function vacant(meals){for(const meal of meals)if(db.prepare('SELECT 1 FROM meals WHERE date=? AND slot=?').get(meal.date,meal.slot))throw inputError('Un créneau de destination est déjà occupé. Aucun repas n’a été ajouté.');}
  function copyIn(source,start,target) {
    const meals=rules.copiedMeals(source,start,target,references());vacant(meals);
    const ids=new Map();for(const [i,meal] of meals.entries())ids.set(source[i].id,saveIn(meal,null));
    for(const meal of source)if(meal.leftoverOf!=null)db.prepare('UPDATE meals SET leftover_of=? WHERE id=?').run(ids.get(meal.leftoverOf),ids.get(meal.id));
    return meals.length;
  }
  const planWeek=input=>write(()=>{
    const meals=rules.planMeals(input,references());vacant(meals);for(const meal of meals)saveIn(meal,null);return meals.length;
  });
  const copyWeek=input=>{rules.validateCopy(input);return write(()=>{
    const source=read(input.sourceStart);if(input.sourceSnapshot!==JSON.stringify(source))throw inputError('La semaine source a changé. Recharge son aperçu.');
    return copyIn(source,input.sourceStart,input.targetStart);
  });};
  const templates=()=>db.prepare('SELECT id,name,created_at AS createdAt,json_array_length(meals_json) AS mealCount FROM week_templates ORDER BY name COLLATE NOCASE,id').all();
  function saveTemplate(input) {
    const name=rules.templateName(input);
    return write(()=>{
      const source=rules.checkedSource(read(input.start),input.start);
      if(db.prepare('SELECT COUNT(*) AS n FROM week_templates').get().n>=30)throw inputError('Tu peux conserver 30 semaines types maximum.');
      try {
        const result=db.prepare('INSERT INTO week_templates(name,source_start,meals_json,created_at) VALUES(?,?,?,?)').run(name,input.start,JSON.stringify(source),new Date().toISOString());
        return {id:Number(result.lastInsertRowid),name,mealCount:source.length};
      }catch(error){if(error.code==='ERR_SQLITE_ERROR'&&/UNIQUE constraint failed: week_templates.name/.test(error.message))throw inputError('Une semaine type porte déjà ce nom.');throw error;}
    });
  }
  const applyTemplate=(id,input)=>{const target=rules.targetWeek(input);return write(()=>{
    const template=db.prepare('SELECT source_start AS sourceStart,meals_json AS mealsJson FROM week_templates WHERE id=?').get(id);
    if(!template)throw inputError('Semaine type inconnue.');return copyIn(JSON.parse(template.mealsJson),template.sourceStart,target);
  });};
  const removeTemplate=id=>write(()=>{if(!db.prepare('DELETE FROM week_templates WHERE id=?').run(id).changes)throw inputError('Semaine type inconnue.');return true;});
  function get(id){
    const row=db.prepare('SELECT date FROM meals WHERE id=?').get(id);if(!row)throw inputError('Repas inconnu.');return read(row.date,row.date).find(meal=>meal.id===id);
  }
  const place=(id,input)=>{rules.validatePlacement(id,input);return write(()=>{
    const source=get(id),parent=source.leftoverOf==null?null:get(source.leftoverOf),rest=db.prepare('SELECT date,slot FROM meals WHERE leftover_of=?').all(id);
    rules.checkPlacement(input,source,parent,rest);vacant([input]);
    if(input.action==='copy')saveIn(checkMealReferences(validateMealInput({...source,date:input.date,slot:input.slot}),references()),null);
    else db.prepare('UPDATE meals SET date=?,slot=? WHERE id=?').run(input.date,input.slot,id);
    return true;
  });};
  const leftovers=input=>{rules.validateLeftovers(input);return write(()=>{
    const source=get(input.sourceId),meal=rules.leftoverMeal(input,source);vacant([meal]);
    const result=db.prepare('INSERT INTO meals(date,slot,location,occasion,people,recipe_id,title,leftover_of) VALUES(?,?,?,?,?,?,?,?)').run(meal.date,meal.slot,meal.location,meal.occasion,meal.people,meal.recipeId,meal.title,source.id);
    children(Number(result.lastInsertRowid),meal);return true;
  });};
  return {planWeek,copyWeek,templates,saveTemplate,applyTemplate,removeTemplate,place,leftovers};
}
module.exports={sqlitePlanning};
