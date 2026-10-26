const {pantryChange,pantryError,pantryId}=require('../pantry');
function sqlitePantry(db){
  function write(work){db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
  const save=input=>write(()=>{
    const rows=db.prepare('SELECT id,name,unit,CAST(food_key AS BLOB) AS storageKey,explicit_lot AS explicitLot,use_by AS useBy FROM pantry').all();
    const item=pantryChange(input,rows),values=[item.storageKey,item.name,item.unit,item.amount,item.recordedOn,item.useBy];
    if(item.id!==undefined)db.prepare('UPDATE pantry SET food_key=CAST(? AS TEXT),name=?,unit=?,amount=?,recorded_on=?,use_by=? WHERE id=?').run(...values,item.id);
    else db.prepare('INSERT INTO pantry(food_key,name,unit,amount,recorded_on,use_by,explicit_lot) VALUES(CAST(? AS TEXT),?,?,?,?,?,?)').run(...values,item.explicitLot);
    return true;
  });
  const remove=id=>write(()=>{pantryId(id);if(!db.prepare('DELETE FROM pantry WHERE id=?').run(id).changes)throw pantryError('Aliment inconnu');return true;});
  return {save,remove};
}
module.exports={sqlitePantry};
