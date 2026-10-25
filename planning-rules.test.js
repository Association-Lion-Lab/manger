const test=require('node:test');
const assert=require('node:assert/strict');
const rules=require('./planning');
const {mealDraft}=require('./test-support/meal-store');
test('snapshot : identités, créneaux, parents et chronologie refusés avant copie',()=>{
  const start='2026-12-28',root={...mealDraft({date:start}),id:0,leftoverOf:null},child={...mealDraft({date:'2026-12-29'}),id:1,leftoverOf:0};
  assert.equal(rules.checkedSource([child,root],start).length,2);
  for(const source of [[root,root],[root,{...child,slot:root.slot,date:root.date}],[root,{...child,date:'2027-01-04'}],[{...child,leftoverOf:999}],[root,{...child,leftoverOf:1}],[{...root,leftoverOf:1},child],[root,{...child,date:'2026-12-27'}]])assert.throws(()=>rules.checkedSource(source,start),{code:'MANGER_MEAL_INPUT'});
});
test('copie : frontière d’année et source sans mutation ; paramètres invalides refusés',()=>{
  const source=[{...mealDraft({date:'2026-12-28'}),id:0,leftoverOf:null}],before=JSON.stringify(source),refs={members:[],recipes:[],proteins:[]};
  assert.equal(rules.copiedMeals(source,'2026-12-28','2027-01-04',refs)[0].date,'2027-01-04');assert.equal(JSON.stringify(source),before);
  for(const input of [{},{sourceStart:'2026-12-28',targetStart:'2026-12-28'},{sourceStart:'2026-12-29',targetStart:'2027-01-04'}])assert.throws(()=>rules.validateCopy(input),{code:'MANGER_MEAL_INPUT'});
});
