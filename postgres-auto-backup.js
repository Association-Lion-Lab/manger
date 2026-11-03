const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const {join,resolve,dirname,isAbsolute}=require('node:path');
const {createHash,randomBytes}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const instance=require('./postgres-instance');
const tools=require('./db/instance-tools');
const names=['automatic.json','database.dump','manifest.json'];
const archiveName=/^auto-\d{8}T\d{9}Z-[a-f0-9]{12}$/;
const failure=code=>Object.assign(new Error('Sauvegarde automatique refusée ou non confirmée.'),{code});
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

async function regularFile(path,code){
  const info=await fs.lstat(path);
  if(!info.isFile()||info.isSymbolicLink())throw failure(code);
  return info;
}
async function jsonFile(path,code){
  try{
    if((await regularFile(path,code)).size>65536)throw failure(code);
    return JSON.parse(await fs.readFile(path,'utf8'));
  }catch{throw failure(code);}
}
async function digestFile(path){
  await regularFile(path,'MANGER_AUTO_ARCHIVE');
  const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
  return hash.digest('hex');
}
async function saveJson(path,value){
  const file=await fs.open(path,'wx',0o600);
  try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
  await tools.syncDirectory(dirname(path));
}
async function prepareRoot(directory,owner){
  let created=false;
  try{await tools.secureDirectory(directory);created=true;}catch(error){if(error.code!=='EEXIST')throw error;}
  const info=await fs.lstat(directory);
  if(!info.isDirectory()||info.isSymbolicLink()||(process.platform!=='win32'&&(info.mode&0o077)))throw failure('MANGER_AUTO_DIRECTORY');
  const path=join(directory,'.owner.json');
  if(created)await saveJson(path,owner);
  if(!isDeepStrictEqual(await jsonFile(path,'MANGER_AUTO_OWNER'),owner))throw failure('MANGER_AUTO_OWNER');
  if(created)await tools.syncDirectory(dirname(directory));
  return fs.realpath(directory);
}
async function archiveDigests(folder,owner){
  const info=await fs.lstat(folder);
  if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(folder)!==folder)throw failure('MANGER_AUTO_ARCHIVE');
  const manifest=await jsonFile(join(folder,'manifest.json'),'MANGER_AUTO_ARCHIVE');
  if(manifest.format!=='manger-instance'||manifest.version!==1||manifest.major!==18||
    manifest.applicationRole!==owner.applicationRole||manifest.migrationRole!==owner.migrationRole||!validHash(manifest.archive))throw failure('MANGER_AUTO_ARCHIVE');
  const dumpHash=await digestFile(join(folder,'database.dump'));
  if(dumpHash!==manifest.archive)throw failure('MANGER_AUTO_ARCHIVE');
  return {dumpHash,manifestHash:await digestFile(join(folder,'manifest.json'))};
}
async function completedArchives(root,owner){
  const completed=[];
  for(const name of await fs.readdir(root)){
    if(!archiveName.test(name))continue;
    const folder=join(root,name),info=await fs.lstat(folder);
    if(!info.isDirectory()||info.isSymbolicLink())throw failure('MANGER_AUTO_ARCHIVE');
    try{await fs.lstat(join(folder,'automatic.json'));}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(!isDeepStrictEqual((await fs.readdir(folder)).sort(),names))throw failure('MANGER_AUTO_ARCHIVE');
    const marker=await jsonFile(join(folder,'automatic.json'),'MANGER_AUTO_ARCHIVE');
    const expected={format:'manger-automatic-archive',version:1,instance:owner.instance,name,...await archiveDigests(folder,owner)};
    if(!isDeepStrictEqual(marker,expected))throw failure('MANGER_AUTO_ARCHIVE');
    completed.push(name);
  }
  return completed.sort().reverse();
}
async function rotate(root,owner,current,keep){
  // Validate retained copies too: a corrupt newer copy must never displace a good older one.
  const completed=await completedArchives(root,owner);
  if(!completed.includes(current))throw failure('MANGER_AUTO_ARCHIVE');
  const removed=completed.filter(name=>name!==current).slice(keep-1);
  for(const name of removed){
    const folder=join(root,name);
    if(dirname(folder)!==root||await fs.realpath(folder)!==folder)throw failure('MANGER_AUTO_ARCHIVE');
    // Remove the completion marker first; an interrupted prune leaves an incomplete folder.
    for(const file of names)await fs.unlink(join(folder,file));
    await fs.rmdir(folder);
  }
  await tools.syncDirectory(root);
  return {retained:completed.length-removed.length,removed:removed.length};
}
async function automaticBackup(config,{directory,toolsDirectory,applicationRole,instance:instanceName='manger-postgres-validation',keep=7,now=new Date()}={}){
  if(!Number.isSafeInteger(keep)||keep<1||keep>90||!isAbsolute(directory||'')||
    !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(instanceName)||!(now instanceof Date)||!Number.isFinite(now.getTime()))throw failure('MANGER_AUTO_CONFIG');
  const owner={format:'manger-automatic-root',version:1,instance:instanceName,host:config.host,port:config.port,database:config.database,migrationRole:config.user,applicationRole};
  const root=await prepareRoot(resolve(directory),owner),lockPath=join(root,'.lock'),token=randomBytes(16).toString('hex');
  const lock=await fs.open(lockPath,'wx',0o600);
  try{
    await lock.writeFile(token);await lock.sync();await tools.syncDirectory(root);
    const name='auto-'+now.toISOString().replace(/[-:.]/g,'')+'-'+randomBytes(6).toString('hex'),folder=join(root,name);
    const result=await instance.backupInstance(config,folder,{toolsDirectory,applicationRole});
    if(result.status!=='backed-up'||result.tables!==25)throw failure('MANGER_AUTO_ARCHIVE');
    const hashes=await archiveDigests(folder,owner);
    // Inventory reading does not connect to PostgreSQL or prove a complete restoration.
    await tools.withTools(config,toolsDirectory,run=>run('pg_restore',['--list',join(folder,'database.dump')],['ignore','ignore','pipe']));
    await saveJson(join(folder,'automatic.json'),{format:'manger-automatic-archive',version:1,instance:owner.instance,name,...hashes});
    await tools.syncDirectory(root);
    return {status:'backed-up',tables:25,archive:name,integrity:'sha256-and-inventory',...await rotate(root,owner,name,keep)};
  }finally{
    await lock.close();
    if(await fs.readFile(lockPath,'utf8')!==token)throw failure('MANGER_AUTO_LOCK');
    await fs.unlink(lockPath);await tools.syncDirectory(root);
  }
}
if(require.main===module){
  (async()=>{
    if(process.argv.length!==2)throw failure('MANGER_AUTO_USAGE');
    const config=require('./db/config').postgresConfig(process.env,{administrative:true});
    const report=await automaticBackup(config,{directory:'/archives/automatic',toolsDirectory:process.env.MANGER_PG_TOOLS,applicationRole:process.env.MANGER_PG_USER});
    console.log(`Sauvegarde terminée : ${report.retained} archive(s) conservée(s), ${report.removed} ancienne(s) retirée(s). Intégrité et inventaire contrôlés.`);
  })().catch(error=>{console.error(`Sauvegarde automatique non confirmée (${error.code||'MANGER_AUTO_FAILED'}). Consulter la procédure de diagnostic ; ne pas effacer les archives.`);process.exitCode=1;});
}
module.exports={automaticBackup};
