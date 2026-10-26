const {pantryChange,pantryError,pantryId}=require('../pantry');
const {lockHousehold}=require('./household');
function postgresPantry(db){
  const write=work=>db.transaction(async tx=>{await lockHousehold(tx);return work(tx);});
  const save=input=>write(async tx=>{
    const rows=(await tx.query('SELECT id::float8 AS id,name,unit,food_key AS "storageKey",explicit_lot AS "explicitLot",use_by AS "useBy" FROM household.pantry')).rows;
    const item=pantryChange(input,rows),values=[item.storageKey,item.name,item.unit,item.amount,item.recordedOn,item.useBy];
    if(item.id!==undefined)await tx.query('UPDATE household.pantry SET food_key=$1,name=$2,unit=$3,amount=$4,recorded_on=$5,use_by=$6 WHERE id=$7',[...values,item.id]);
    else await tx.query('INSERT INTO household.pantry(food_key,name,unit,amount,recorded_on,use_by,explicit_lot) VALUES($1,$2,$3,$4,$5,$6,$7)',[...values,item.explicitLot]);
    return true;
  });
  const remove=id=>write(async tx=>{pantryId(id);if(!(await tx.query('DELETE FROM household.pantry WHERE id=$1 RETURNING id',[id])).rowCount)throw pantryError('Aliment inconnu');return true;});
  return {save,remove};
}
module.exports={postgresPantry};
