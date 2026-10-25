const {isDateKey,addDays}=require('./dates');
const {isCompatible,isDietCompatible}=require('./household');
const inputError=(message,status=400)=>Object.assign(new Error(message),{code:'MANGER_MEAL_INPUT',status});
function validateSlot(date,slot) {
  if(!isDateKey(date)||!['midi','soir'].includes(slot))throw inputError('Créneau invalide');
}
function validateExpectedId(id) {
  if(id!==undefined&&id!==null&&!Number.isSafeInteger(id))throw inputError('Identifiant de repas invalide');
}
function checkExpectedId(current,id) {
  validateExpectedId(id);
  if(id!==undefined&&(current?.id??null)!==id)throw inputError('Ce créneau a changé. Recharge le planning avant de réessayer.',409);
}
function validateMealInput(input) {
  if(!input||!isDateKey(input.date))throw inputError('Date invalide');
  if(!['midi','soir'].includes(input.slot))throw inputError('Créneau invalide');
  if(!['home','outside','restaurant'].includes(input.location))throw inputError('Lieu invalide');
  if(!['regular','date','guests'].includes(input.occasion))throw inputError('Occasion invalide');
  if(!Number.isInteger(input.people)||input.people<1||input.people>100)throw inputError('Nombre de personnes invalide');
  if(typeof input.title!=='string'||!input.title.trim()||input.title.length>120||input.title.includes('\0'))throw inputError('Titre invalide');
  if(input.recipeId!=null&&!Number.isSafeInteger(input.recipeId))throw inputError('Recette inconnue');
  if(input.location!=='home'&&input.recipeId!=null)throw inputError('Une recette est réservée aux repas à la maison');
  const assignments=input.assignments??[],dishes=input.dishes??[];
  for(const rows of [assignments,dishes]) {
    if(!Array.isArray(rows)||rows.length>100)throw inputError('Répartition invalide');
    const seen=new Set();
    for(const row of rows) {
      if(!row||!Number.isSafeInteger(row.memberId)||!Number.isInteger(row.portions)||row.portions<1||row.portions>20)throw inputError('Répartition invalide');
      if(seen.has(row.memberId))throw inputError('Membre présent plusieurs fois');
      seen.add(row.memberId);
    }
  }
  if(assignments.some(a=>!Number.isSafeInteger(a.proteinId))||dishes.some(d=>!Number.isSafeInteger(d.recipeId)))throw inputError('Répartition invalide');
  if(dishes.some(d=>d.proteinId!=null&&!Number.isSafeInteger(d.proteinId)))throw inputError('Protéine invalide');
  if(dishes.length&&assignments.length)throw inputError('Répartition invalide');
  if(input.location!=='home'&&assignments.length)throw inputError('Les variantes sont réservées aux repas à la maison');
  if(input.location!=='home'&&dishes.length)throw inputError('Les recettes sont réservées aux repas à la maison');
  if(dishes.length&&input.recipeId!=null)throw inputError('Une base commune et deux recettes ne peuvent pas être combinées');
  const people=(assignments.length?assignments:dishes).reduce((sum,row)=>sum+row.portions,0)||input.people;
  if(people>100)throw inputError('Nombre de personnes invalide');
  return {date:input.date,slot:input.slot,location:input.location,occasion:input.occasion,people,recipeId:input.recipeId??null,title:input.title.trim(),assignments,dishes};
}
function checkMealReferences(meal,rows) {
  const members=new Map(rows.members.map(r=>[r.id,r])),proteins=new Map(rows.proteins.map(r=>[r.id,r])),recipes=new Map(rows.recipes.map(r=>[r.id,r]));
  const base=recipes.get(meal.recipeId);
  if(meal.recipeId!==null&&!base)throw inputError('Recette inconnue');
  for(const a of meal.assignments) {
    const member=members.get(a.memberId),protein=proteins.get(a.proteinId);
    if(!member||!protein||!isCompatible(member.diet,protein.category)||(base&&!isDietCompatible(member.diet,base.diet)))throw inputError('Recette ou protéine incompatible avec le régime');
  }
  for(const d of meal.dishes) {
    const member=members.get(d.memberId),recipe=recipes.get(d.recipeId);
    if(!member||!recipe||!isDietCompatible(member.diet,recipe.diet))throw inputError('Recette incompatible avec le régime');
    const protein=proteins.get(d.proteinId);
    if(d.proteinId!=null&&(!protein||!isCompatible(member.diet,protein.category)))throw inputError('Protéine incompatible avec le régime');
  }
  return meal;
}
function calendarMeals(meals) {
  const escape=value=>String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const events=meals.flatMap(meal=>{
    const date=meal.date.replace(/-/g,''),nextDate=addDays(meal.date,1).replace(/-/g,'');
    const slot=meal.slot==='midi'?'Midi':'Soir',place=meal.location==='home'?'Maison':meal.location==='restaurant'?'Restaurant':'Extérieur';
    return ['BEGIN:VEVENT',`UID:meal-${meal.id}@manger`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${date}`,`DTEND;VALUE=DATE:${nextDate}`,`SUMMARY:${escape(`${slot} — ${meal.title}`)}`,`DESCRIPTION:${escape(`${place} · ${meal.people} personne${meal.people>1?'s':''}`)}`,'END:VEVENT'];
  });
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Manger!//FR','CALSCALE:GREGORIAN',...events,'END:VCALENDAR',''].join('\r\n');
}
module.exports={inputError,validateSlot,validateExpectedId,checkExpectedId,validateMealInput,checkMealReferences,calendarMeals};
