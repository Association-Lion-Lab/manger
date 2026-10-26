const {randomUUID}=require('node:crypto');
const {foodKey,foodName}=require('./ingredients');
const {dateKey,isDateKey}=require('./dates');
function pantryError(message){return Object.assign(new Error(message),{code:'MANGER_PANTRY_INPUT'});}
function pantryChange(input,rows){
  if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>80||input.name.includes('\0')||typeof input.unit!=='string'||!input.unit.trim()||input.unit.length>24||input.unit.includes('\0')||typeof input.amount!=='number'||!Number.isFinite(input.amount)||input.amount<=0||input.amount>1000000)throw pantryError('Indique un aliment, une unité et une quantité positive.');
  if(input.useBy!=null&&!isDateKey(input.useBy))throw pantryError('Date du placard invalide.');
  if(input.newLot!==undefined&&typeof input.newLot!=='boolean')throw pantryError('Lot invalide.');
  if(input.id!==undefined&&(!Number.isSafeInteger(input.id)||input.id<1||input.newLot))throw pantryError('Lot invalide.');
  const item={name:foodName(input.name),unit:input.unit.trim(),amount:input.amount},key=foodKey(item);
  const existing=rows.filter(row=>input.id!==undefined?row.id===input.id:!input.newLot&&foodKey(row)===key);
  if(input.id!==undefined&&(!existing.length||foodKey(existing[0])!==key))throw pantryError('Lot inconnu ou aliment modifié.');
  if(existing.length>1)throw pantryError('Plusieurs stocks correspondent à cet aliment. Retire les doublons du placard puis saisis la quantité totale actuelle.');
  if(!existing.length&&rows.length>=500)throw pantryError('Le placard peut contenir 500 lots maximum.');
  const old=existing[0];
  return {...item,id:old?.id,storageKey:old?(old.explicitLot||input.id!==undefined?old.storageKey:Buffer.from(key)):Buffer.from(input.newLot?`lot:${randomUUID()}`:key),
    recordedOn:dateKey(new Date()),useBy:input.useBy===undefined?old?.useBy??null:input.useBy,explicitLot:old?.explicitLot??Number(Boolean(input.newLot))};
}
function pantryId(id){if(!Number.isSafeInteger(id)||id<0)throw pantryError('Aliment inconnu');return id;}
module.exports={pantryChange,pantryError,pantryId};
