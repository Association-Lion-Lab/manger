const {TABLES,kind,validateTables}=require('./migration-format');
const {readPostgresTables}=require('./migration-verify');
const {validateCopies,readCopies}=require('./fdl-format');
const MAX_BACKUP_BYTES=32*1024*1024;
const tables=TABLES.filter(t=>t.schema==='household');
const backupError=(code='MANGER_BACKUP_INPUT')=>Object.assign(new Error(code==='MANGER_BACKUP_TOO_LARGE'?'Sauvegarde trop volumineuse : 32 Mo maximum. Utilise une sauvegarde administrateur.':'Sauvegarde du foyer invalide ou incompatible.'),{code});
function encodeHousehold(data,fdl){
  try{validateTables(data,{includeAuth:false});}catch{throw backupError('MANGER_BACKUP_FORMAT');}
  if(fdl!==undefined)try{validateCopies(fdl,data);}catch{throw backupError('MANGER_BACKUP_FORMAT');}
  const encoded={};
  for(const table of tables)encoded[table.key]=data[table.key].map(row=>Object.fromEntries(table.columns.map(c=>[c,kind(table,c)==='binary'?{base64:row[c].toString('base64')}:row[c]])));
  const bytes=Buffer.from(JSON.stringify({format:'manger-household',version:fdl===undefined?1:2,createdAt:new Date().toISOString(),tables:encoded,...(fdl===undefined?{}:{fdl})}));
  if(bytes.length>MAX_BACKUP_BYTES)throw backupError('MANGER_BACKUP_TOO_LARGE');return bytes;
}
function decodeHousehold(bytes){
  if(!Buffer.isBuffer(bytes)||!bytes.length)throw backupError();if(bytes.length>MAX_BACKUP_BYTES)throw backupError('MANGER_BACKUP_TOO_LARGE');
  try{
    const input=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));
    if(!input||![1,2].includes(input.version)||Object.keys(input).sort().join(',')!==(input.version===2?'createdAt,fdl,format,tables,version':'createdAt,format,tables,version')||input.format!=='manger-household'||typeof input.createdAt!=='string'||!Number.isFinite(Date.parse(input.createdAt))||new Date(input.createdAt).toISOString()!==input.createdAt)throw backupError();
    if(!input.tables||Object.keys(input.tables).sort().join(',')!==tables.map(t=>t.key).sort().join(','))throw backupError();
    for(const table of tables){
      if(!Array.isArray(input.tables[table.key]))throw backupError();
      for(const row of input.tables[table.key])for(const column of table.columns.filter(c=>kind(table,c)==='binary')){
        const value=row?.[column];if(!value||Object.keys(value).join(',')!=='base64'||typeof value.base64!=='string')throw backupError();
        const decoded=Buffer.from(value.base64,'base64');if(decoded.toString('base64')!==value.base64)throw backupError();row[column]=decoded;
      }
    }
    validateTables(input.tables,{includeAuth:false});if(input.version===2)validateCopies(input.fdl,input.tables);
    return {tables:input.tables,createdAt:input.createdAt,...(input.version===2?{fdl:input.fdl}:{})};
  }catch(error){throw error.code==='MANGER_BACKUP_TOO_LARGE'?error:backupError();}
}
function postgresHouseholdBackup(db){
  return ()=>db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return encodeHousehold(await readPostgresTables(tx,{includeAuth:false}),await readCopies(tx));
  });
}
module.exports={encodeHousehold,decodeHousehold,postgresHouseholdBackup,MAX_BACKUP_BYTES,backupError};
