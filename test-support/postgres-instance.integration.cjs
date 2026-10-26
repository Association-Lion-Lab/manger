const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,readFile,writeFile,rm}=require('node:fs/promises');
const {join}=require('node:path');const {tmpdir}=require('node:os');
const {databaseFixture}=require('./database');const {postgresFixture}=require('./postgres');
const {migrationSourceFixture}=require('./migration-source-fixture');const {analyzeSource}=require('../migration-source');
const {migratePostgres}=require('../migrate-postgres');
const {backupInstance,restoreInstance,verifyInstance,openInstance}=require('../postgres-instance');
const {administrativePool}=require('../db/config');const {openPostgres}=require('../db/postgres');
const {readPostgresTables,verifyMigration}=require('../migration-verify');const {postgresAuth}=require('../db/auth');
const {createServer}=require('node:http');const {protectAccounts}=require('../accounts');
test('instance complète : vrais pg_dump et pg_restore sur deux clusters privés',{timeout:120000},async t=>{
  const source=await databaseFixture(t),target=await postgresFixture(t),data=await analyzeSource(await migrationSourceFixture(t));await migratePostgres(source.migrationPool,data);
  const config=f=>{const o=f.migrationPool.options;return{host:o.host,port:o.port,user:o.user,password:o.password,database:o.database,ssl:false};};
  const root=await mkdtemp(join(tmpdir(),'manger-instance-test-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const toolsDirectory=process.env.MANGER_TEST_PG_BIN||join(__dirname,'..','.test-tools','postgresql-18.6-5','pgsql','bin'),applicationRole='manger_test_app',folder=join(root,'backup');
  const options={toolsDirectory,applicationRole};
  await t.test('archive privée, métadonnées et empreintes complètes, aucune donnée dans le rapport',async()=>{
    const report=await backupInstance(config(source),folder,options);assert.equal(report.status,'backed-up');assert.doesNotMatch(JSON.stringify(report),/Avis|password|Café|tomate/);
    const manifest=JSON.parse(await readFile(join(folder,'manifest.json')));assert.equal(Object.keys(manifest.data.counts).length,22);assert.match(manifest.metadata,/^[a-f0-9]{64}$/);
    await assert.rejects(backupInstance(config(source),folder,options));
  });
  await t.test('cible occupée ou connexion encore ouverte refusée sans écrasement',async()=>{
    await assert.rejects(restoreInstance(config(source),folder,{...options,trusted:true,writersStopped:true,targetEmpty:true}));
    assert.equal(verifyMigration(data.tables,await readPostgresTables(source.database)).tables,22);
    await assert.rejects(openInstance(config(source),folder,{...options,writersStopped:true}),{code:'MANGER_INSTANCE_ALREADY_OPEN'});
    assert.equal((await source.migrationPool.query("SELECT has_database_privilege('manger_test_app',current_database(),'CONNECT') AS allowed")).rows[0].allowed,true);
    const blocker=await target.pool.connect();
    try{await assert.rejects(restoreInstance(config(target),folder,{...options,trusted:true,writersStopped:true,targetEmpty:true}),{code:'MANGER_INSTANCE_CONNECTIONS'});}
    finally{blocker.release();}
    await target.pool.end();await target.migrationPool.end();
  });
  await t.test('archive altérée refusée avant connexion ou mutation',async()=>{
    const path=join(folder,'database.dump'),bytes=await readFile(path);await writeFile(path,Buffer.concat([bytes,Buffer.from('altered')]));
    try{await assert.rejects(restoreInstance(config(target),folder,{...options,trusted:true,writersStopped:true,targetEmpty:true}),{code:'MANGER_INSTANCE_ARCHIVE'});}
    finally{await writeFile(path,bytes);}
    const metaPath=join(folder,'manifest.json'),original=await readFile(metaPath);
    const owner=administrativePool(config(target)),state=async()=>(await owner.query("SELECT datacl::text AS acl,to_regnamespace('household')::text AS household FROM pg_database WHERE datname=current_database()")).rows[0],before=await state();
    try{
      for(const change of [m=>delete m.data,m=>m.metadata='x',m=>m.data.algorithm='other',m=>m.data.counts['auth.accounts']=-1]){
        const value=JSON.parse(original);change(value);await writeFile(metaPath,JSON.stringify(value));
        await assert.rejects(restoreInstance({...config(target),port:1},folder,{...options,trusted:true,writersStopped:true,targetEmpty:true}),{code:'MANGER_INSTANCE_ARCHIVE'});
      }
      assert.deepEqual(await state(),before);assert.equal(before.household,null);
    }finally{await writeFile(metaPath,original);await owner.end();}
  });
  await t.test('restauration de confiance atomique, contrôle séparé puis ouverture explicite',async()=>{
    const result=await restoreInstance(config(target),folder,{...options,trusted:true,writersStopped:true,targetEmpty:true});
    assert.equal(result.status,'verified-closed');
    assert.equal((await verifyInstance(config(target),folder,options)).status,'verified-closed');
    const owner=administrativePool(config(target));
    try{
      const time=(await owner.query('SELECT applied_at::text AS time FROM manger_meta.schema_migrations WHERE version=1')).rows[0].time;
      await owner.query("UPDATE manger_meta.schema_migrations SET applied_at=applied_at+interval '1 microsecond' WHERE version=1");
      await assert.rejects(verifyInstance(config(target),folder,options),{code:'MANGER_INSTANCE_MISMATCH'});
      await owner.query('UPDATE manger_meta.schema_migrations SET applied_at=$1::timestamptz WHERE version=1',[time]);
      const checksum=(await owner.query('SELECT checksum FROM manger_meta.schema_migrations WHERE version=1')).rows[0].checksum;
      await owner.query("UPDATE manger_meta.schema_migrations SET checksum=repeat('0',64) WHERE version=1");
      await assert.rejects(verifyInstance(config(target),folder,options),/incompatible/);
      await owner.query('UPDATE manger_meta.schema_migrations SET checksum=$1 WHERE version=1',[checksum]);
      await owner.query('GRANT CONNECT ON DATABASE manger_test TO pg_read_all_data');
      try{await assert.rejects(openInstance(config(target),folder,{...options,writersStopped:true}),{code:'MANGER_INSTANCE_ACL'});}
      finally{await owner.query('REVOKE CONNECT ON DATABASE manger_test FROM pg_read_all_data');}
    }finally{await owner.end();}
    const secret=join(root,'target-password');await writeFile(secret,config(target).password,{flag:'wx',mode:0o600});
    const {stdout}=await require('node:util').promisify(require('node:child_process').execFile)(process.execPath,[join(__dirname,'..','postgres-instance.js'),'verify',folder],{
      windowsHide:true,timeout:20000,maxBuffer:8192,env:{...process.env,MANGER_PG_HOST:'127.0.0.1',MANGER_PG_PORT:String(target.port),MANGER_PG_DATABASE:'manger_test',MANGER_PG_USER:applicationRole,MANGER_PG_MIGRATION_USER:'manger_test_migrator',MANGER_PG_MIGRATION_PASSWORD_FILE:secret,MANGER_PG_TLS:'disable-local'}});
    assert.equal(JSON.parse(stdout).status,'verified-closed');assert.doesNotMatch(stdout,/long-password|Café|Avis/);
    const appConfig={...config(target),user:'manger_test_app',password:target.pool.options.password};
    await assert.rejects(openPostgres(appConfig),{code:'42501'});
    assert.equal((await openInstance(config(target),folder,{...options,writersStopped:true})).status,'ready');
    assert.equal((await verifyInstance(config(target),folder,options)).status,'verified-open');
    const db=await openPostgres(appConfig);try{
      assert.equal(verifyMigration(data.tables,await readPostgresTables(db)).tables,22);
      const auth=postgresAuth(db),admin=await auth.findUser('admin');assert.equal(admin.password,data.tables['auth.accounts'].find(r=>r.username==='admin').password);
      assert.ok(await auth.session(require('node:crypto').createHash('sha256').update('c'.repeat(64)).digest('hex')));
      const server=createServer(protectAccounts(null,()=>assert.fail('Connexion doit être gérée avant le métier'),{auth}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
      try{
        const base=`http://127.0.0.1:${server.address().port}`,response=await fetch(base+'/api/account/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'long-password-admin'}),signal:AbortSignal.timeout(8000)});
        assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/^manger_session=[a-f0-9]{64};/);await response.arrayBuffer();
      }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
      const row=(await db.query("INSERT INTO household.recipes(title,minutes,servings) VALUES('Après secours',1,1) RETURNING id::float8 AS id")).rows[0];assert.ok(row.id>Math.max(...data.tables['household.recipes'].map(r=>r.id)));
    }finally{await db.close();}
    await assert.rejects(restoreInstance(config(target),folder,{...options,trusted:true,writersStopped:true,targetEmpty:true}));
  });
});
