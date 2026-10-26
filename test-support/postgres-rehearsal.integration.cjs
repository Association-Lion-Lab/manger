const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,mkdir,readFile,writeFile,copyFile,stat,rm,readdir}=require('node:fs/promises');
const {join}=require('node:path'),{tmpdir}=require('node:os'),{createHash}=require('node:crypto');
const {databaseFixture}=require('./database'),{postgresFixture}=require('./postgres');
const {migrationSourceFixture}=require('./migration-source-fixture');
const {analyzeSource}=require('../migration-source'),{migratePostgres}=require('../migrate-postgres');
const {readPostgresTables,verifyMigration}=require('../migration-verify'),{TABLES}=require('../migration-format');
const {backupInstance,verifyInstance,restoreInstance,openInstance}=require('../postgres-instance');
const {createPostgresRuntime}=require('../postgres-app'),{createDatabase,createApp}=require('../server');
const {openAccounts}=require('../accounts');
const {administrativePool}=require('../db/config');

function config(f,administrative=false){
  const o=(administrative?f.migrationPool:f.pool).options;
  return {host:o.host,port:o.port,user:o.user,password:o.password,database:o.database,ssl:false};
}
function failAfterPhoto(pool,hit){
  return {connect(callback){pool.connect((error,client)=>{
    if(error)return callback(error);
    callback(null,{on:(...args)=>client.on(...args),off:(...args)=>client.off(...args),release:destroy=>client.release(destroy),async query(sql,args){
      const result=await client.query(sql,args);
      if(typeof sql==='string'&&sql.startsWith('INSERT INTO household.recipe_photos')){hit();await client.query('SELECT 1/0');}
      return result;
    }});
  });}};
}
async function json(base,path,method='GET',body){
  const response=await fetch(base+path,{method,signal:AbortSignal.timeout(10000),headers:{Origin:base,Cookie:'manger_session='+'c'.repeat(64),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  assert.equal(response.status,200,path);return response.json();
}
async function sqliteAvailable(source,folder){
  await mkdir(folder);await copyFile(source.home,join(folder,'manger.db'));await copyFile(source.accounts,join(folder,'accounts.db'));
  const data=createDatabase(join(folder,'manger.db'),{seedData:false});let accounts,server;
  try{
    accounts=openAccounts(join(folder,'accounts.db'));server=createApp(data,accounts,null);
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await json(base,'/api/account')).username,'admin');
    assert.equal((await json(base,'/api/week?start=2026-11-02')).recipes.length,1);
    for(const db of [data,accounts])assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  }finally{
    if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}
    accounts?.close();data.close();
  }
}
async function environment(f,root,name){
  const secret=join(root,name+'-password');await writeFile(secret,config(f).password,{flag:'wx',mode:0o600});
  return {...process.env,MANGER_STORAGE:'postgres',MANGER_POSTGRES_CANDIDATE:'1',MANGER_PG_HOST:'127.0.0.1',MANGER_PG_PORT:String(f.port),MANGER_PG_DATABASE:'manger_test',MANGER_PG_USER:'manger_test_app',MANGER_PG_PASSWORD_FILE:secret,MANGER_PG_TLS:'disable-local',MANGER_DATA_DIR:join(root,name+'-runtime'),MANGER_TLS_CERT:'',MANGER_TLS_KEY:'',MANGER_TLS_CA:'',MANGER_SMTP_HOST:'',MANGER_SECURE_COOKIE:'0'};
}
async function bytes(folder){
  let total=0;for(const name of await readdir(folder,{withFileTypes:true})){const file=join(folder,name.name);total+=name.isDirectory()?await bytes(file):(await stat(file)).size;}return total;
}

test('répétition : pannes, ancien SQLite utilisable, divergence et secours récent',{timeout:180000},async t=>{
  const started=performance.now(),times={},sizes={};
  const source=await migrationSourceFixture(t),root=await mkdtemp(join(tmpdir(),'manger-rehearsal-'));
  t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
  const original=await Promise.all([hash(source.home),hash(source.accounts)]);
  const unchanged=async()=>assert.deepEqual(await Promise.all([hash(source.home),hash(source.accounts)]),original);
  const measure=async(name,action)=>{const begin=performance.now();const value=await action();times[name]=Math.round(performance.now()-begin);return value;};
  sizes.sqlite=(await stat(source.home)).size+(await stat(source.accounts)).size;
  const data=await measure('analysisMs',()=>analyzeSource(source)),failed=await databaseFixture(t);

  await t.test('source invalide puis import interrompu : origine utilisable, aucune fusion',async()=>{
    const bad=join(root,'invalid.db');await writeFile(bad,'synthetic invalid SQLite');
    await assert.rejects(analyzeSource({...source,home:bad}),{code:'MANGER_SOURCE_INVALID'});
    assert.equal((await failed.migrationPool.query('SELECT count(*)::int AS n FROM manger_meta.data_import')).rows[0].n,0);
    await unchanged();await sqliteAvailable(source,join(root,'after-analysis-refusal'));await unchanged();
    let injected=false;
    await assert.rejects(migratePostgres(failAfterPhoto(failed.migrationPool,()=>injected=true),data),{code:'MANGER_TRANSFER_INVALID'});
    assert.equal(injected,true);
    for(const table of TABLES)assert.equal((await failed.database.query(`SELECT count(*)::int AS n FROM ${table.key}`)).rows[0].n,0);
    assert.equal((await failed.database.query('SELECT household.storage_status() AS s')).rows[0].s.ready,false);
    assert.equal((await failed.migrationPool.query('SELECT status FROM manger_meta.data_import')).rows[0].status,'pending');
    await assert.rejects(migratePostgres(failed.migrationPool,data),{code:'MANGER_TRANSFER_INVALID'});
    await unchanged();await sqliteAvailable(source,join(root,'after-import-failure'));await unchanged();
  });

  const target=await databaseFixture(t);
  await measure('importMs',()=>migratePostgres(target.migrationPool,data));
  const env=await environment(target,root,'candidate');
  const options={applicationRole:'manger_test_app',toolsDirectory:process.env.MANGER_TEST_PG_BIN||join(__dirname,'..','.test-tools','postgresql-18.6-5','pgsql','bin')};
  const baseline=join(root,'before-writes'),recent=join(root,'after-writes');

  await t.test('démarrage refusé : import intact et copies SQLite encore utilisables',async()=>{
    await target.migrationPool.query("UPDATE manger_meta.data_import SET status='pending'");
    try{await assert.rejects(createPostgresRuntime(env),{code:'MANGER_POSTGRES_NOT_READY'});}
    finally{await target.migrationPool.query("UPDATE manger_meta.data_import SET status='ready'");}
    assert.equal(verifyMigration(data.tables,await readPostgresTables(target.database)).tables,22);
    await unchanged();await sqliteAvailable(source,join(root,'after-startup-refusal'));await unchanged();
  });

  await t.test('avant nouvelle écriture : archive complète conforme et ancien serveur disponible',async()=>{
    await measure('baselineBackupMs',()=>backupInstance(config(target,true),baseline,options));
    assert.equal((await verifyInstance(config(target,true),baseline,options)).status,'verified-open');
    await sqliteAvailable(source,join(root,'before-reopening'));await unchanged();
    sizes.baselineArchive=await bytes(baseline);
  });

  await t.test('après écriture : ancien état refusé, archive récente conservée et secours restauré',async()=>{
    const runtime=await measure('runtimeOpenMs',()=>createPostgresRuntime(env));t.after(()=>runtime.close());
    await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${runtime.server.address().port}`;
    try{
      assert.equal((await json(base,'/api/account')).username,'admin');
      await json(base,'/api/recipes/5000000001/notes','PUT',{rating:5,note:'Écrit après ouverture PostgreSQL.'});
    }finally{await runtime.close();}
    await assert.rejects(verifyInstance(config(target,true),baseline,options),{code:'MANGER_INSTANCE_MISMATCH'});
    await measure('recentBackupMs',()=>backupInstance(config(target,true),recent,options));
    assert.equal((await verifyInstance(config(target,true),recent,options)).status,'verified-open');
    sizes.recentArchive=await bytes(recent);
    // Disk measurement uses the administrative budget, never the application's query deadline.
    const measurement=administrativePool(config(target,true));
    try{sizes.postgres=Number((await measurement.query('SELECT pg_database_size(current_database())::text AS size')).rows[0].size);}
    finally{await measurement.end();}
    const rescue=await postgresFixture(t);await rescue.pool.end();await rescue.migrationPool.end();
    assert.equal((await measure('restoreMs',()=>restoreInstance(config(rescue,true),recent,{...options,trusted:true,writersStopped:true,targetEmpty:true}))).status,'verified-closed');
    assert.equal((await openInstance(config(rescue,true),recent,{...options,writersStopped:true})).status,'ready');
    const recovered=await createPostgresRuntime(await environment(rescue,root,'rescue'));t.after(()=>recovered.close());
    try{
      await new Promise(r=>recovered.server.listen(0,'127.0.0.1',r));const recoveredBase=`http://127.0.0.1:${recovered.server.address().port}`;
      assert.equal((await json(recoveredBase,'/api/account')).username,'admin');
      const week=await json(recoveredBase,'/api/week?start=2026-11-02');
      assert.equal(week.recipes.find(r=>r.id===5000000001).note,'Écrit après ouverture PostgreSQL.');
    }finally{await recovered.close();}
    await unchanged();
  });
  times.totalMs=Math.round(performance.now()-started);
  for(const value of [...Object.values(times),...Object.values(sizes)])assert.ok(Number.isFinite(value)&&value>0);
  t.diagnostic(JSON.stringify({syntheticOnly:true,times,sizes}));
});
