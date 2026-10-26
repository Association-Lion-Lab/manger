const {foodKey}=require('../ingredients');
const {validate,weekKey,identity,shoppingError,shoppingState,weekState,syncMatches}=require('../shopping');
const {postgresSnapshot}=require('./calculations');
const {lockHousehold}=require('./household');
function postgresShopping(db){
  const write=work=>db.transaction(async tx=>{await lockHousehold(tx);return work(tx);});
  async function snapshot(tx){
    const data=await postgresSnapshot(tx),checks=(await tx.query('SELECT week_start,name,unit FROM household.shopping_checks')).rows;
    const aisles=(await tx.query('SELECT name,unit,aisle FROM household.shopping_aisles ORDER BY sort_order')).rows;
    const manual=(await tx.query('SELECT id::float8 AS "manualId",week_start,name,amount,unit,aisle,checked FROM household.shopping_manual ORDER BY id')).rows;
    return {...data,checks,aisles,manual};
  }
  const reading=(rule,start)=>{weekKey(start);return db.transaction(async tx=>{await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return rule(await snapshot(tx),start);});};
  const read=start=>reading(shoppingState,start),week=start=>reading(weekState,start);
  async function checkIn(tx,input){
    if(input.manualId!=null){if(!(await tx.query('UPDATE household.shopping_manual SET checked=$1 WHERE id=$2 AND week_start=$3 RETURNING id',[Number(input.checked),input.manualId,input.weekStart])).rowCount)throw shoppingError('Article inconnu');return;}
    const rows=(await tx.query('SELECT name,unit FROM household.shopping_checks WHERE week_start=$1',[input.weekStart])).rows;
    for(const row of rows)if(foodKey(row)===foodKey(input))await tx.query('DELETE FROM household.shopping_checks WHERE week_start=$1 AND name=$2 AND unit=$3',[input.weekStart,row.name,row.unit]);
    if(input.checked)await tx.query('INSERT INTO household.shopping_checks(week_start,name,unit) VALUES($1,$2,$3)',[input.weekStart,input.name,input.unit]);
  }
  const check=input=>{validate('check',input);return write(tx=>checkIn(tx,input));};
  const sync=input=>{validate('sync',input);return write(async tx=>{
    const current=shoppingState(await snapshot(tx),input.weekStart),result=syncMatches(current,input);
    for(const index of result.accepted){const match=current.find(row=>identity(row)===identity(input.items[index]));if(!match.checked)await checkIn(tx,{...match,weekStart:input.weekStart,checked:true});}return result;
  });};
  const aisle=input=>{validate('aisle',input);return write(async tx=>{
    if(input.manualId!=null){if(!(await tx.query('UPDATE household.shopping_manual SET aisle=$1 WHERE id=$2 AND week_start=$3 RETURNING id',[input.aisle,input.manualId,input.weekStart])).rowCount)throw shoppingError('Article inconnu');}
    else{
      for(const row of (await tx.query('SELECT name,unit FROM household.shopping_aisles')).rows)if(foodKey(row)===foodKey(input))await tx.query('DELETE FROM household.shopping_aisles WHERE name=$1 AND unit=$2',[row.name,row.unit]);
      if(input.aisle)await tx.query('INSERT INTO household.shopping_aisles(name,unit,aisle) VALUES($1,$2,$3)',[input.name,input.unit,input.aisle]);
    }
  });};
  const saveManual=(input,id=null)=>{validate('manual',input,id);return write(async tx=>{
    const values=[input.name.trim(),input.amount,input.unit.trim(),input.aisle];
    if(id===null)return(await tx.query('INSERT INTO household.shopping_manual(week_start,name,amount,unit,aisle) VALUES($1,$2,$3,$4,$5) RETURNING id::float8 AS id',[input.weekStart,...values])).rows[0].id;
    const p=input.previous;if(!(await tx.query('UPDATE household.shopping_manual SET name=$1,amount=$2,unit=$3,aisle=$4 WHERE id=$5 AND week_start=$6 AND name=$7 AND amount=$8 AND unit=$9 AND aisle=$10 RETURNING id',[...values,id,input.weekStart,p.name,p.amount,p.unit,p.aisle])).rowCount)throw shoppingError('Cet article a été modifié ou supprimé ailleurs. Ferme cette fenêtre et recharge la page avant de réessayer.',409);return id;
  });};
  const removeManual=id=>write(async tx=>{if(!Number.isSafeInteger(id)||!(await tx.query('DELETE FROM household.shopping_manual WHERE id=$1 RETURNING id',[id])).rowCount)throw shoppingError('Article inconnu');});
  return {read,week,check,sync,aisle,saveManual,removeManual};
}
module.exports={postgresShopping};
