const {isDateKey,addDays,DAY_MS}=require('./dates');
const {inputError,validateMealInput,checkMealReferences,validateSlot}=require('./meal');
const {isDietCompatible}=require('./household');
const monday=date=>isDateKey(date)&&new Date(`${date}T12:00:00Z`).getUTCDay()===1;
const earlier=(a,b)=>a.date<b.date||(a.date===b.date&&a.slot==='midi'&&b.slot==='soir');
function planMeals(input,refs) {
  if(!input||!isDateKey(input.start)||!Array.isArray(input.meals)||input.meals.length<1||input.meals.length>14)throw inputError('Menu hebdomadaire invalide');
  const seen=new Set();
  return input.meals.map(item=>{
    const meal=checkMealReferences(validateMealInput(item),refs),key=meal.date+'/'+meal.slot;
    if(meal.date<input.start||meal.date>addDays(input.start,6)||seen.has(key)||meal.location!=='home'||meal.occasion!=='regular'||(meal.recipeId===null&&!meal.dishes.length))throw inputError('Créneau du menu invalide');
    seen.add(key);
    if(meal.recipeId!==null&&!meal.assignments.length&&refs.members.some(member=>!isDietCompatible(member.diet,refs.recipes.find(r=>r.id===meal.recipeId).diet)))throw inputError('Recette incompatible avec le foyer');
    return meal;
  });
}
function checkedSource(source,start) {
  if(!Array.isArray(source)||!source.length||source.length>14)throw inputError('Cette semaine ne contient aucun repas.');
  const ids=new Set(),slots=new Set();
  for(const meal of source){
    if(!Number.isSafeInteger(meal?.id)||ids.has(meal.id))throw inputError('Snapshot de semaine invalide.');
    validateMealInput(meal);const key=meal.date+'/'+meal.slot;
    if(meal.date<start||meal.date>addDays(start,6)||slots.has(key))throw inputError('Snapshot de semaine invalide.');
    ids.add(meal.id);slots.add(key);
  }
  for(const meal of source)if(meal.leftoverOf!=null){
    const parent=source.find(p=>p.id===meal.leftoverOf);
    if(!parent)throw inputError('Cette semaine contient des restes préparés une autre semaine. Copie ces repas séparément depuis leur préparation.');
    if(parent.leftoverOf!=null||!earlier(parent,meal))throw inputError('Liens de restes invalides dans cette semaine.');
  }
  return source;
}
function copiedMeals(source,start,target,refs) {
  if(!monday(start)||!monday(target))throw inputError('Semaine de destination invalide.');
  checkedSource(source,start);
  const offset=Math.round((new Date(`${target}T12:00:00Z`)-new Date(`${start}T12:00:00Z`))/DAY_MS);
  return source.map(meal=>checkMealReferences(validateMealInput({...meal,date:addDays(meal.date,offset)}),refs));
}
function validateCopy(input) {
  if(!input||!monday(input.sourceStart)||!monday(input.targetStart)||input.sourceStart===input.targetStart)throw inputError('Choisis deux semaines différentes, commençant un lundi.');
}
function templateName(input) {
  const name=typeof input?.name==='string'?input.name.trim():'';
  if(!name||name.length>60||name.includes('\0')||!monday(input.start))throw inputError('Nom ou semaine type invalide.');
  return name;
}
function targetWeek(input){if(!monday(input?.targetStart))throw inputError('Semaine de destination invalide.');return input.targetStart;}
function validateId(id){if(!Number.isSafeInteger(id))throw inputError('Identifiant invalide.');}
function validatePlacement(id,input){
  validateId(id);if(!input||!['move','copy'].includes(input.action))throw inputError('Date ou créneau invalide.');validateSlot(input.date,input.slot);
}
function checkPlacement(input,source,parent,children){
  if(source.date!==input.sourceDate||source.slot!==input.sourceSlot)throw inputError('Le repas a été déplacé entre-temps. Recharge le planning.');
  if(input.action==='copy'&&source.leftoverOf!=null)throw inputError('Pour prévoir plus de restes, pars du repas où tu cuisines.');
  if(input.action==='move'){
    if(parent&&!earlier(parent,input))throw inputError('Les restes doivent rester après le repas cuisiné.');
    if(children.some(row=>!earlier(input,row)))throw inputError('Le repas cuisiné doit rester avant ses restes.');
  }
}
function validateLeftovers(input){
  validateId(input?.sourceId);if(!input||!isDateKey(input.date)||!['midi','soir'].includes(input.slot))throw inputError('Choisis une date et un créneau valides.');
}
function leftoverMeal(input,source){
  if(source.location!=='home'||source.leftoverOf!=null||(source.recipeId==null&&!source.dishes?.length))throw inputError('Ce repas ne permet pas de prévoir des restes.');
  if(!earlier(source,input))throw inputError('Choisis un repas après celui où tu cuisines.');
  const original=source.dishes?.length?source.dishes:(source.recipeId!=null?(source.assignments||[]).map(a=>({...a,recipeId:source.recipeId})):[]);
  let dishes=[],people=input.people;
  if(original.length){
    if(!Array.isArray(input.dishes)||!input.dishes.length||input.dishes.length>original.length)throw inputError('Choisis au moins une assiette à conserver.');
    const seen=new Set();dishes=input.dishes.map(d=>{
      const match=original.find(r=>r.memberId===d?.memberId);
      if(!match||seen.has(d.memberId)||!Number.isInteger(d.portions)||d.portions<1||d.portions>20)throw inputError('Assiettes de restes invalides.');
      seen.add(d.memberId);return {...match,portions:d.portions};
    });people=dishes.reduce((sum,d)=>sum+d.portions,0);
  }else if(!Number.isInteger(people)||people<1||people>100)throw inputError('Choisis un nombre de portions valide.');
  if(source.people+source.extraPortions+people>100)throw inputError('Limite de 100 portions cuisinées par repas.');
  return validateMealInput({date:input.date,slot:input.slot,location:'home',occasion:'regular',people,recipeId:original.length?null:source.recipeId,title:source.title,assignments:[],dishes});
}
module.exports={monday,earlier,planMeals,checkedSource,copiedMeals,validateCopy,templateName,targetWeek,validateId,validatePlacement,checkPlacement,validateLeftovers,leftoverMeal};
