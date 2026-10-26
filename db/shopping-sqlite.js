const {foodKey}=require('../ingredients');
const {validate,weekKey,identity,shoppingError,shoppingState,weekState,syncMatches}=require('../shopping');
const {sqliteSnapshot}=require('./calculations-sqlite');
function sqliteShopping(db){
  function transaction(work,write=false){db.exec(write?'BEGIN IMMEDIATE':'BEGIN');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
  const snapshot=()=>({...sqliteSnapshot(db),checks:db.prepare('SELECT week_start,name,unit FROM shopping_checks').all(),aisles:db.prepare('SELECT name,unit,aisle FROM shopping_aisles ORDER BY rowid').all(),manual:db.prepare('SELECT id AS manualId,week_start,name,amount,unit,aisle,checked FROM shopping_manual ORDER BY id').all()});
  const read=start=>{weekKey(start);return transaction(()=>shoppingState(snapshot(),start));};
  const week=start=>{weekKey(start);return transaction(()=>weekState(snapshot(),start));};
  function checkIn(input){
    if(input.manualId!=null){if(!db.prepare('UPDATE shopping_manual SET checked=? WHERE id=? AND week_start=?').run(Number(input.checked),input.manualId,input.weekStart).changes)throw shoppingError('Article inconnu');return;}
    for(const row of db.prepare('SELECT name,unit FROM shopping_checks WHERE week_start=?').all(input.weekStart))if(foodKey(row)===foodKey(input))db.prepare('DELETE FROM shopping_checks WHERE week_start=? AND name=? AND unit=?').run(input.weekStart,row.name,row.unit);
    if(input.checked)db.prepare('INSERT INTO shopping_checks(week_start,name,unit) VALUES(?,?,?)').run(input.weekStart,input.name,input.unit);
  }
  const check=input=>{validate('check',input);return transaction(()=>checkIn(input),true);};
  const sync=input=>{validate('sync',input);return transaction(()=>{
    const current=shoppingState(snapshot(),input.weekStart),result=syncMatches(current,input);
    for(const index of result.accepted){const match=current.find(row=>identity(row)===identity(input.items[index]));if(!match.checked)checkIn({...match,weekStart:input.weekStart,checked:true});}
    return result;
  },true);};
  const aisle=input=>{validate('aisle',input);return transaction(()=>{
    if(input.manualId!=null){if(!db.prepare('UPDATE shopping_manual SET aisle=? WHERE id=? AND week_start=?').run(input.aisle,input.manualId,input.weekStart).changes)throw shoppingError('Article inconnu');}
    else{
      for(const row of db.prepare('SELECT name,unit FROM shopping_aisles').all())if(foodKey(row)===foodKey(input))db.prepare('DELETE FROM shopping_aisles WHERE name=? AND unit=?').run(row.name,row.unit);
      if(input.aisle)db.prepare('INSERT INTO shopping_aisles(name,unit,aisle) VALUES(?,?,?)').run(input.name,input.unit,input.aisle);
    }
  },true);};
  const saveManual=(input,id=null)=>{validate('manual',input,id);return transaction(()=>{
    const values=[input.name.trim(),input.amount,input.unit.trim(),input.aisle];
    if(id===null)return Number(db.prepare('INSERT INTO shopping_manual(week_start,name,amount,unit,aisle) VALUES(?,?,?,?,?)').run(input.weekStart,...values).lastInsertRowid);
    const p=input.previous;if(!db.prepare('UPDATE shopping_manual SET name=?,amount=?,unit=?,aisle=? WHERE id=? AND week_start=? AND name=? AND amount=? AND unit=? AND aisle=?').run(...values,id,input.weekStart,p.name,p.amount,p.unit,p.aisle).changes)throw shoppingError('Cet article a été modifié ou supprimé ailleurs. Ferme cette fenêtre et recharge la page avant de réessayer.',409);return id;
  },true);};
  const removeManual=id=>transaction(()=>{if(!Number.isSafeInteger(id)||!db.prepare('DELETE FROM shopping_manual WHERE id=?').run(id).changes)throw shoppingError('Article inconnu');},true);
  return {read,week,check,sync,aisle,saveManual,removeManual};
}
module.exports={sqliteShopping};
