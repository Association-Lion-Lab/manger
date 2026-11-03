const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,readFile,readdir,appendFile,rm}=require('node:fs/promises'),{join}=require('node:path'),{tmpdir}=require('node:os');
const {databaseFixture}=require('./database'),{postgresFixture}=require('./postgres');
const {migrationSourceFixture}=require('./migration-source-fixture'),{analyzeSource}=require('../migration-source'),{migratePostgres}=require('../migrate-postgres');
const instance=require('../postgres-instance'),tools=require('../db/instance-tools');
const {automaticBackup}=require('../postgres-auto-backup');
const config=f=>{const o=f.migrationPool.options;return{host:o.host,port:o.port,user:o.user,password:o.password,database:o.database,ssl:false};};

test('automatic online backup : real dump, offline inventory, rotation and restore',{timeout:120000},async t=>{
  const source=await databaseFixture(t),target=await postgresFixture(t),data=await analyzeSource(await migrationSourceFixture(t));
  await migratePostgres(source.migrationPool,data);
  const root=await mkdtemp(join(tmpdir(),'manger-auto-native-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const directory=join(root,'automatic'),toolsDirectory=process.env.MANGER_TEST_PG_BIN||join(__dirname,'..','.test-tools','postgresql-18.6-5','pgsql','bin');
  const options={directory,toolsDirectory,applicationRole:'manger_test_app',instance:'synthetic-native',keep:2};
  const original=instance.backupInstance,originalTools=tools.withTools;
  const before=(await source.database.query('SELECT title FROM household.recipes WHERE id=5000000001')).rows[0].title;
  let changed=false,first;
  t.mock.method(instance,'backupInstance',async(...args)=>{
    const report=await original(...args);
    if(!changed){changed=true;await source.database.query("UPDATE household.recipes SET title='changed after snapshot' WHERE id=5000000001");}
    return report;
  });
  // Only the inventory reader gets an unreachable endpoint: it must not connect or restore.
  t.mock.method(tools,'withTools',(settings,bin,work)=>originalTools({...settings,port:1},bin,work));
  await t.test('new live writes do not invalidate snapshot checksum/inventory checks',async()=>{
    first=await automaticBackup(config(source),options);
    assert.equal(first.integrity,'sha256-and-inventory');assert.equal(first.tables,25);
    const folder=join(directory,first.archive),manifest=JSON.parse(await readFile(join(folder,'manifest.json')));
    assert.equal(Object.keys(manifest.data.counts).length,25);
    await assert.rejects(instance.verifyInstance(config(source),folder,options),{code:'MANGER_INSTANCE_MISMATCH'});
    assert.equal((await source.database.query('SELECT title FROM household.recipes WHERE id=5000000001')).rows[0].title,'changed after snapshot');
  });
  await t.test('automatic archive restores the frozen data on a separate empty cluster',async()=>{
    await target.pool.end();await target.migrationPool.end();
    const folder=join(directory,first.archive),restoreOptions={...options,trusted:true,targetEmpty:true,writersStopped:true};
    assert.equal((await instance.restoreInstance(config(target),folder,restoreOptions)).status,'verified-closed');
    assert.equal((await instance.verifyInstance(config(target),folder,options)).status,'verified-closed');
    assert.equal((await instance.openInstance(config(target),folder,restoreOptions)).status,'ready');
    const db=await require('../db/postgres').openPostgres({...config(target),user:'manger_test_app',password:target.pool.options.password});
    try{assert.equal((await db.query('SELECT title FROM household.recipes WHERE id=5000000001')).rows[0].title,before);}
    finally{await db.close();}
  });
  await t.test('real subsequent dumps rotate only completed automatic archives',async()=>{
    await automaticBackup(config(source),options);const report=await automaticBackup(config(source),options);
    assert.equal(report.retained,2);assert.equal(report.removed,1);
    assert.equal((await readdir(directory)).filter(name=>name.startsWith('auto-')).length,2);
  });
  await t.test('corruption of a retained real archive prevents pruning',async()=>{
    const previous=(await readdir(directory)).filter(name=>name.startsWith('auto-')).sort();
    await appendFile(join(directory,previous[1],'database.dump'),'corrupted');
    await assert.rejects(automaticBackup(config(source),options),{code:'MANGER_AUTO_ARCHIVE'});
    const after=await readdir(directory);for(const name of previous)assert.ok(after.includes(name));
    assert.equal((await source.database.query('SELECT count(*)::int AS n FROM household.recipes')).rows[0].n,1);
  });
});
