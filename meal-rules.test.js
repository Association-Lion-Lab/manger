const test=require('node:test');
const assert=require('node:assert/strict');
const {createDatabase,validateMeal}=require('./server');
const draft=()=>({date:'2026-10-26',slot:'midi',location:'home',occasion:'regular',people:2,recipeId:1,title:' Bowl '});

test('repas : NUL, références non numériques et total de portions refusés avant SQL',()=>{
  const db=createDatabase(':memory:');
  try {
    for(const change of [{title:'x\0y'},{recipeId:'1'},{recipeId:9007199254740992}])assert.throws(()=>validateMeal({...draft(),...change},db),{code:'MANGER_MEAL_INPUT'});
    const id=Number(db.prepare("INSERT INTO members(name,diet) VALUES('admin','omnivore')").run().lastInsertRowid);
    assert.throws(()=>validateMeal({...draft(),assignments:[{memberId:id,proteinId:1,portions:21}]},db),{code:'MANGER_MEAL_INPUT'});
    const checked=validateMeal({...draft(),recipeId:null,dishes:[{memberId:id,recipeId:1,portions:2,proteinId:null}]},db);
    assert.equal(checked.people,2);assert.equal(checked.title,'Bowl');
    const many=Array.from({length:6},(_,n)=>({memberId:Number(db.prepare("INSERT INTO members(name,diet) VALUES(?,'omnivore')").run('Total '+n).lastInsertRowid),proteinId:1,portions:20}));
    assert.throws(()=>validateMeal({...draft(),assignments:many},db),{code:'MANGER_MEAL_INPUT'});
  } finally {db.close();}
});

test('dates des repas : jours invalides, année bissextile et passage d’année sans fuseau',()=>{
  const {isDateKey,addDays}=require('./dates');
  for(const value of ['2026-02-29','2026-13-01','2026-02-30',null,20261026])assert.equal(isDateKey(value),false);
  assert.equal(isDateKey('2028-02-29'),true);assert.equal(addDays('2026-12-31',1),'2027-01-01');
});
