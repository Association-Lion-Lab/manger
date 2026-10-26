const {mkdtemp,writeFile,rm,mkdir,open,lstat}=require('node:fs/promises');
const {join,basename,dirname,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const {randomUUID}=require('node:crypto');
const {decodeHousehold,encodeHousehold,MAX_BACKUP_BYTES}=require('./household-backup');
const {analyzeSource}=require('./migration-source');
const {lockTables,insertTables,sequenceStarts,householdOrder}=require('./postgres-transfer');
const {lockHousehold}=require('./db/household');
const {readPostgresTables,verifyMigration}=require('./migration-verify');
const {structureFingerprint}=require('./db/structure');
const restoreError=(code='MANGER_RESTORE_INPUT')=>Object.assign(new Error(code==='MANGER_RESTORE_EXPIRED'?'Aperçu expiré. Vérifie à nouveau le fichier.':'Sauvegarde du foyer invalide ou incompatible.'),{code});

async function readUpload(request){
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>MAX_BACKUP_BYTES)throw restoreError('MANGER_RESTORE_SIZE');chunks.push(chunk);}
  if(!size)throw restoreError();return Buffer.concat(chunks);
}
async function parseUpload(bytes){
  if(!bytes.subarray(0,16).equals(Buffer.from('SQLite format 3\0')))return decodeHousehold(bytes).tables;
  const folder=await mkdtemp(join(tmpdir(),'manger-restore-source-'));
  try{
    const home=join(folder,'candidate.db');await writeFile(home,bytes,{mode:0o600});
    return (await analyzeSource({home},{includeAuth:false})).tables;
  }finally{
    if(dirname(folder)===resolve(tmpdir())&&basename(folder).startsWith('manger-restore-source-'))await rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
}
async function saveRecovery(directory,bytes){
  try{await mkdir(directory,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const info=await lstat(directory);
  if(!info.isDirectory()||info.isSymbolicLink()||(process.platform!=='win32'&&(info.mode&0o077)))throw restoreError('MANGER_RECOVERY_UNSAFE');
  const name=`before-restore-${randomUUID()}.json`,file=await open(join(directory,name),'wx',0o600);
  try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  if(process.platform!=='win32')for(const path of [directory,dirname(directory)]){
    const folder=await open(path,'r');try{await folder.sync();}finally{await folder.close();}
  }
  return `recovery/${name}`;
}
async function checkedStructure(tx){
  const status=(await tx.query('SELECT household.storage_status() AS status')).rows[0]?.status;
  if(!status?.ready||!status.structureChecksum||status.structureChecksum!==await structureFingerprint(tx))throw restoreError('MANGER_STRUCTURE_INVALID');
}
async function boundedRecovery(directory,bytes){
  let timer;
  try{return await Promise.race([saveRecovery(directory,bytes),new Promise((_,reject)=>{timer=setTimeout(()=>reject(restoreError('MANGER_RECOVERY_TIMEOUT')),20000);})]);}
  finally{clearTimeout(timer);}
}
function createPostgresRestore(db,{recoveryDirectory,now=Date.now}={}){
  if(typeof recoveryDirectory!=='string'||!recoveryDirectory)throw restoreError('MANGER_RECOVERY_CONFIG');
  let pending=null,busy=false;
  function clear(){if(pending)clearTimeout(pending.timer);pending=null;}
  async function preview(request){
    if(busy)throw restoreError('MANGER_RESTORE_BUSY');busy=true;clear();
    try{
      const tables=await parseUpload(await readUpload(request));sequenceStarts(tables,{includeAuth:false});encodeHousehold(tables);
      const token=randomUUID(),timer=setTimeout(()=>{if(pending?.token===token)clear();},600000);timer.unref();
      pending={tables,token,timer,expires:now()+600000};
      return {token,recipes:tables['household.recipes'].length,members:tables['household.members'].length,meals:tables['household.meals'].length};
    }finally{busy=false;}
  }
  async function apply(token,{authorize}={}){
    if(busy)throw restoreError('MANGER_RESTORE_BUSY');
    if(!pending||typeof token!=='string'||token!==pending.token||now()>=pending.expires)throw restoreError('MANGER_RESTORE_EXPIRED');
    const {tables}=pending;clear();busy=true;let recovery;
    try{
      return await db.transaction(async tx=>{
        if(authorize&&!await authorize(tx))throw restoreError('MANGER_RESTORE_FORBIDDEN');
        await lockHousehold(tx);await lockTables(tx,{includeAuth:false});
        await checkedStructure(tx);
        await tx.query("SET LOCAL idle_in_transaction_session_timeout='60s'");
        recovery=await boundedRecovery(recoveryDirectory,encodeHousehold(await readPostgresTables(tx,{includeAuth:false})));
        await tx.query('UPDATE household.meals SET leftover_of=NULL');
        for(const key of [...householdOrder].reverse())await tx.query(`DELETE FROM ${key}`);
        await insertTables(tx,tables,{includeAuth:false});
        verifyMigration(tables,await readPostgresTables(tx,{includeAuth:false}),{includeAuth:false});
        await tx.query('SELECT household.restart_sequences()');
        await checkedStructure(tx);
        return {restored:true,recovery};
      });
    }catch(error){if(error.code==='POSTGRES_COMMIT_UNCERTAIN')error.recovery=recovery;throw error;}
    finally{busy=false;}
  }
  return Object.freeze({preview,apply,clear});
}
module.exports={createPostgresRestore};
