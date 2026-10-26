const {open,readFile,lstat,copyFile,constants}=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const {join,resolve,dirname}=require('node:path');
const {createHash}=require('node:crypto');
const {administrativePool,postgresConfig}=require('./db/config');
const {reservePostgresClient}=require('./db/postgres');
const {checkRoles,permissions,history:checkHistory,schemaVersion}=require('./db/postgres-schema');
const {verifyStructure}=require('./db/structure');
const {TABLES}=require('./migration-format');
const {secureDirectory,syncDirectory,withTools,instanceError}=require('./db/instance-tools');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validDigest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validRole=value=>typeof value==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(value)&&value!=='public'&&!value.startsWith('pg_');
function validManifest(manifest){
  if(!manifest||Object.keys(manifest).sort().join(',')!=='applicationRole,archive,data,format,major,metadata,migrationRole,schema,structure,version')return false;
  const data=manifest.data,keys=TABLES.map(t=>t.key).sort().join(',');
  return data&&Object.keys(data).sort().join(',')==='algorithm,counts,fingerprints'&&data.algorithm==='pg-json-sha256-v1'&&
    data.counts&&Object.keys(data.counts).sort().join(',')===keys&&Object.values(data.counts).every(n=>Number.isSafeInteger(n)&&n>=0)&&
    data.fingerprints&&Object.keys(data.fingerprints).sort().join(',')===keys&&Object.values(data.fingerprints).every(validDigest)&&
    validDigest(manifest.metadata)&&validDigest(manifest.structure)&&validDigest(manifest.archive);
}
async function archiveHash(path){
  const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw instanceError('MANGER_INSTANCE_ARCHIVE');
  const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');
}
async function databaseAccess(client,role){
  const row=(await client.query(`SELECT has_database_privilege($1,current_database(),'CONNECT') AS allowed,
    EXISTS(SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
      WHERE d.datname=current_database() AND NOT(a.grantee=d.datdba OR
        (a.grantee=$1::regrole::oid AND a.privilege_type='CONNECT' AND NOT a.is_grantable))) AS foreign_acl`,[role])).rows[0];
  if(row.foreign_acl)throw instanceError('MANGER_INSTANCE_ACL');return row.allowed;
}
async function rowFingerprint(client,select){
  // Hash rows on PostgreSQL; only batches of 1,000 small digests reach Node.
  await client.query(`DECLARE manger_digest NO SCROLL CURSOR FOR SELECT h FROM
    (SELECT encode(sha256(convert_to(row_to_json(r)::text,'UTF8')),'hex') AS h FROM (${select}) r) q ORDER BY h COLLATE "C"`);
  const hash=createHash('sha256');let count=0;
  while(true){const {rows}=await client.query('FETCH FORWARD 1000 FROM manger_digest');if(!rows.length)break;for(const row of rows){hash.update(row.h);count++;}}
  await client.query('CLOSE manger_digest');return {count,hash:hash.digest('hex')};
}
async function capture(client,applicationRole){
  await checkRoles(client,applicationRole);await databaseAccess(client,applicationRole);
  await verifyStructure(client);
  if(await checkHistory(client)!==schemaVersion)throw instanceError('MANGER_INSTANCE_SCHEMA');
  const status=(await client.query('SELECT household.storage_status() AS status')).rows[0]?.status;
  if(!status?.ready||status.version!==schemaVersion)throw instanceError('MANGER_INSTANCE_SCHEMA');
  await client.query("SET LOCAL bytea_output='hex'; SET LOCAL extra_float_digits=3; SET LOCAL TimeZone='UTC'; SET LOCAL DateStyle='ISO,YMD'");
  const counts={},fingerprints={};
  for(const table of TABLES){
    const columns=table.columns.map(c=>'"'+c+'"').join(','),result=await rowFingerprint(client,`SELECT ${columns} FROM ${table.key}`);
    counts[table.key]=result.count;fingerprints[table.key]=result.hash;
    const column=table.name==='shopping_aisles'?'sort_order':table.name!=='invitations'&&table.columns.includes('id')?'id':null;
    if(!column)continue;
    const row=(await client.query(`SELECT last_value::float8 AS value,is_called,
      (SELECT greatest(0,coalesce(max(${column}),0))::float8 FROM ${table.key}) AS maximum FROM ${table.key}_${column}_seq`)).rows[0];
    const following=row.value+(row.is_called?1:0);if(!Number.isSafeInteger(following)||following<=row.maximum)throw instanceError('MANGER_INSTANCE_SEQUENCE');
  }
  const history=await rowFingerprint(client,'SELECT version,name,checksum,applied_at::text,structure_checksum FROM manger_meta.schema_migrations');
  const imports=await rowFingerprint(client,'SELECT id,nonce,status,source_hash,created_at::text FROM manger_meta.data_import');
  return {data:{algorithm:'pg-json-sha256-v1',counts,fingerprints},metadata:digest([history,imports]),structure:status.structureChecksum};
}
async function administrative(config,applicationRole,work){
  if(!validRole(applicationRole)||!validRole(config.user)||applicationRole===config.user)throw instanceError('MANGER_INSTANCE_CONFIG');
  const pool=administrativePool(config);let client;
  try{
    client=await reservePostgresClient(pool);
    const version=Number((await client.query('SHOW server_version_num')).rows[0].server_version_num);
    if(version<180000||version>=190000)throw instanceError('MANGER_INSTANCE_VERSION');
    return await work(client);
  }finally{client?.release();await pool.end();}
}
async function readManifest(folder,config,applicationRole){
  const path=join(resolve(folder),'manifest.json'),info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink()||info.size>65536)throw instanceError('MANGER_INSTANCE_ARCHIVE');
  let manifest;try{manifest=JSON.parse(await readFile(path,'utf8'));}catch{throw instanceError('MANGER_INSTANCE_ARCHIVE');}
  if(!validManifest(manifest)||manifest.format!=='manger-instance'||manifest.version!==1||manifest.major!==18||manifest.schema!==schemaVersion||
    manifest.applicationRole!==applicationRole||manifest.migrationRole!==config.user||
    manifest.archive!==await archiveHash(join(folder,'database.dump')))throw instanceError('MANGER_INSTANCE_ARCHIVE');
  return manifest;
}
async function backupInstance(config,folder,{toolsDirectory,applicationRole}={}){
  return withTools(config,toolsDirectory,run=>administrative(config,applicationRole,async client=>{
    folder=resolve(folder);await secureDirectory(folder);
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL idle_in_transaction_session_timeout='10min'");
    try{
      const report=await capture(client,applicationRole),snapshot=(await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
      const file=await open(join(folder,'database.dump'),'wx',0o600);
      try{await run('pg_dump',['--format=custom',`--snapshot=${snapshot}`],['ignore',file.fd,'pipe']);await file.sync();}finally{await file.close();}
      await client.query('COMMIT');
      const manifest={format:'manger-instance',version:1,major:18,schema:schemaVersion,applicationRole,migrationRole:config.user,
        ...report,archive:await archiveHash(join(folder,'database.dump'))};
      const saved=await open(join(folder,'manifest.json'),'wx',0o600);try{await saved.writeFile(JSON.stringify(manifest,null,2));await saved.sync();}finally{await saved.close();}
      await syncDirectory(folder);await syncDirectory(dirname(folder));
      return {status:'backed-up',tables:22};
    }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
  }));
}
async function compare(client,manifest){
  const report=await capture(client,manifest.applicationRole);
  if(digest(report)!==digest({data:manifest.data,metadata:manifest.metadata,structure:manifest.structure}))throw instanceError('MANGER_INSTANCE_MISMATCH');
}
async function closeAccess(client,applicationRole){
  const {rows:[names]}=await client.query('SELECT quote_ident(current_database()) AS db,quote_ident($1) AS role',[applicationRole]);
  await client.query(`REVOKE ALL ON DATABASE ${names.db} FROM PUBLIC, ${names.role}`);
  const others=(await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n;
  if(others)throw instanceError('MANGER_INSTANCE_CONNECTIONS');
}
async function restoreInstance(config,folder,{toolsDirectory,applicationRole,trusted=false,targetEmpty=false,writersStopped=false}={}){
  if(!trusted||!targetEmpty||!writersStopped)throw instanceError('MANGER_INSTANCE_CONFIRM');
  const manifest=await readManifest(folder,config,applicationRole);
  return withTools(config,toolsDirectory,async(run,{workspace})=>{
    const archive=join(workspace,'restore.dump');await copyFile(join(folder,'database.dump'),archive,constants.COPYFILE_EXCL);
    if(await archiveHash(archive)!==manifest.archive)throw instanceError('MANGER_INSTANCE_ARCHIVE');
    const file=await open(archive,'r');
    try{return await administrative(config,applicationRole,async client=>{
    await checkRoles(client,applicationRole);
    await databaseAccess(client,applicationRole);
    const existing=(await client.query("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema')) OR EXISTS(SELECT 1 FROM pg_depend WHERE refclassid='pg_namespace'::regclass AND refobjid='public'::regnamespace) AS occupied")).rows[0].occupied;
    if(existing)throw instanceError('MANGER_INSTANCE_OCCUPIED');
    await closeAccess(client,applicationRole);
    const {rows:[role]}=await client.query('SELECT quote_ident($1) AS name',[applicationRole]);
    await client.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC, ${role.name}`);
    await run('pg_restore',['--single-transaction','--exit-on-error','--no-owner'],[file.fd,'ignore','pipe']);
    // pg_dump omits explicit ACLs equal to defaults. Reapply the same canonical grants,
    // keeping CONNECT closed, before comparing the existing strict structure fingerprint.
    await permissions(client,applicationRole,{connect:false});
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try{await compare(client,manifest);await client.query('COMMIT');}catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
    return {status:'verified-closed',tables:22};
    });}finally{await file.close();}
  });
}
async function closedTarget(client,role){
  await checkRoles(client,role);
  const allowed=await databaseAccess(client,role);
  if(allowed)throw instanceError('MANGER_INSTANCE_ALREADY_OPEN');
  const other=(await client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()')).rows[0].n;
  if(other)throw instanceError('MANGER_INSTANCE_CONNECTIONS');
}
async function verified(config,folder,options,openAccess){
  const manifest=await readManifest(folder,config,options.applicationRole);
  return administrative(config,options.applicationRole,async client=>{
    if(openAccess)await closedTarget(client,options.applicationRole);
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try{await compare(client,manifest);await client.query('COMMIT');}catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
    if(openAccess){
      const {rows:[names]}=await client.query('SELECT quote_ident(current_database()) AS db,quote_ident($1) AS role',[options.applicationRole]);
      await client.query(`GRANT CONNECT ON DATABASE ${names.db} TO ${names.role}`);
    }
    const allowed=(await client.query("SELECT has_database_privilege($1,current_database(),'CONNECT') AS allowed",[options.applicationRole])).rows[0].allowed;
    return {status:openAccess?'ready':allowed?'verified-open':'verified-closed',tables:22};
  });
}
const verifyInstance=(config,folder,options)=>verified(config,folder,options,false);
function openInstance(config,folder,options){if(!options.writersStopped)throw instanceError('MANGER_INSTANCE_CONFIRM');return verified(config,folder,options,true);}
if(require.main===module){
  (async()=>{
    const [command,folder,...flags]=process.argv.slice(2),allowed={backup:[],restore:['--trusted-backup','--target-empty','--writers-stopped'],verify:[],open:['--writers-stopped']};
    if(!folder||!Object.hasOwn(allowed,command)||flags.length!==allowed[command].length||flags.some(f=>!allowed[command].includes(f))||new Set(flags).size!==flags.length)throw instanceError('MANGER_INSTANCE_USAGE');
    const config=postgresConfig(process.env,{administrative:true}),options={applicationRole:process.env.MANGER_PG_USER,toolsDirectory:process.env.MANGER_PG_TOOLS,trusted:flags.includes('--trusted-backup'),targetEmpty:flags.includes('--target-empty'),writersStopped:flags.includes('--writers-stopped')};
    console.log(JSON.stringify(await({backup:backupInstance,restore:restoreInstance,verify:verifyInstance,open:openInstance}[command])(config,folder,options)));
  })().catch(error=>{console.error(`Opération non confirmée (${error.code||'MANGER_INSTANCE_FAILED'}). Vérifie la cible avec la commande verify, sans rejouer restore. Les données de la source restent inchangées.`);process.exitCode=1;});
}
module.exports={backupInstance,restoreInstance,verifyInstance,openInstance};
