const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');
const {mkdtemp,mkdir,writeFile,rm,realpath,lstat,open}=require('node:fs/promises');
const {join,resolve,dirname,basename}=require('node:path');
const {tmpdir}=require('node:os');
const {poolOptions}=require('./postgres');
const execute=promisify(execFile);
const instanceError=(code='MANGER_INSTANCE_FAILED')=>Object.assign(new Error('Opération administrateur refusée ou non confirmée. Vérifie la cible sans recommencer la restauration.'),{code});
const cleanEnvironment=()=>Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PG/i.test(key)));
const quoted=value=>"'"+String(value).replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
async function syncDirectory(path){
  if(process.platform==='win32')return;
  const directory=await open(path,'r');try{await directory.sync();}finally{await directory.close();}
}
function passwordLine(config){
  const fields=[config.host,config.port,config.database,config.user,config.password];
  if(fields.some(v=>/[\r\n\0]/.test(String(v))))throw instanceError('MANGER_INSTANCE_CONFIG');
  return fields.map(v=>String(v).replaceAll('\\','\\\\').replaceAll(':','\\:')).join(':')+'\n';
}
function connectionString(config,{passfile,ca}){
  poolOptions(config);passwordLine(config);
  if(config.ssl!==false&&!ca)throw instanceError('MANGER_INSTANCE_CA');
  return Object.entries({host:config.host,port:config.port,dbname:config.database,user:config.user,
    passfile,sslmode:config.ssl===false?'disable':'verify-full',...(ca?{sslrootcert:ca}:{}),
    gssencmode:'disable',sslcertmode:'disable',connect_timeout:5,application_name:'manger-backup',
    options:'-c search_path=pg_catalog -c statement_timeout=300000 -c lock_timeout=5000'}).map(([k,v])=>`${k}=${quoted(v)}`).join(' ');
}
async function secureDirectory(path,{temporary=false}={}){
  const folder=temporary?await mkdtemp(path):(await mkdir(path,{mode:0o700}),path);
  if(process.platform==='win32'){
    const {stdout}=await execute('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true,timeout:5000});
    const sid=stdout.match(/S-1-5-\d+(?:-\d+)+/)?.[0];if(!sid)throw instanceError('MANGER_INSTANCE_PERMISSIONS');
    await execute('icacls.exe',[folder,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{windowsHide:true,timeout:5000});
  }
  const info=await lstat(folder);
  if(!info.isDirectory()||info.isSymbolicLink()||(process.platform!=='win32'&&(info.mode&0o077)))throw instanceError('MANGER_INSTANCE_PERMISSIONS');
  return folder;
}
async function withTools(config,directory,work){
  poolOptions(config);passwordLine(config);
  if(typeof directory!=='string'||!directory)throw instanceError('MANGER_INSTANCE_TOOLS');
  const env=cleanEnvironment(),binary=name=>join(resolve(directory),name+(process.platform==='win32'?'.exe':''));
  for(const name of ['pg_dump','pg_restore']){
    const {stdout}=await execute(binary(name),['--version'],{env,windowsHide:true,timeout:5000,maxBuffer:4096});
    if(!/\b18\.\d+\b/.test(stdout))throw instanceError('MANGER_INSTANCE_VERSION');
  }
  const parent=await realpath(tmpdir()),folder=await secureDirectory(join(parent,'manger-instance-secret-'),{temporary:true});
  try{
    const passfile=join(folder,'pgpass'),ca=config.ssl?.ca?join(folder,'ca.crt'):null;
    if(config.ssl!==false&&!ca)throw instanceError('MANGER_INSTANCE_CA');
    await writeFile(passfile,passwordLine(config),{flag:'wx',mode:0o600});
    if(ca)await writeFile(ca,config.ssl.ca,{flag:'wx',mode:0o600});
    const connection=connectionString(config,{passfile,ca});
    const run=(name,args,stdio=['ignore','ignore','pipe'])=>new Promise((resolveRun,reject)=>{
      const child=spawn(binary(name),['--no-password',`--dbname=${connection}`,...args],{env,windowsHide:true,stdio});
      let timedOut=false;child.stderr?.on('data',()=>{});
      const timer=setTimeout(()=>{timedOut=true;child.kill();},300000);
      child.once('error',()=>{clearTimeout(timer);reject(instanceError('MANGER_INSTANCE_TOOL'));});
      child.once('exit',code=>{clearTimeout(timer);code===0&&!timedOut?resolveRun():reject(instanceError('MANGER_INSTANCE_TOOL'));});
    });
    return await work(run,{workspace:folder});
  }finally{
    if(dirname(folder)!==parent||!basename(folder).startsWith('manger-instance-secret-')||await realpath(folder)!==folder)throw instanceError('MANGER_INSTANCE_CLEANUP');
    await rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
}
module.exports={connectionString,passwordLine,secureDirectory,syncDirectory,withTools,instanceError};
