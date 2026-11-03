const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),{join}=require('node:path'),{tmpdir}=require('node:os'),{createHash}=require('node:crypto');
const instance=require('./postgres-instance'),tools=require('./db/instance-tools');
const {automaticBackup}=require('./postgres-auto-backup');
const hash=value=>createHash('sha256').update(value).digest('hex');
const config={host:'synthetic.invalid',port:5432,database:'manger',user:'owner',password:'synthetic-private-password',ssl:false};

async function fixture(t){
  const root=await fs.mkdtemp(join(tmpdir(),'manger-auto-test-')),directory=join(root,'automatic');
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  let failure='',calls=0;
  t.mock.method(instance,'backupInstance',async(_config,folder)=>{
    calls++;await fs.mkdir(folder,{mode:0o700});const bytes=Buffer.from('synthetic dump '+calls);
    await fs.writeFile(join(folder,'database.dump'),bytes);
    if(failure==='dump')throw Object.assign(new Error('private detail must stay private'),{code:'SYNTHETIC_BACKUP_FAILED'});
    await fs.writeFile(join(folder,'manifest.json'),JSON.stringify({format:'manger-instance',version:1,major:18,applicationRole:'app',migrationRole:'owner',archive:hash(bytes)}));
    return {status:'backed-up',tables:25};
  });
  t.mock.method(tools,'withTools',async(_config,_directory,work)=>work(async(name,args)=>{
    assert.equal(name,'pg_restore');assert.equal(args[0],'--list');
    if(failure==='inventory')throw Object.assign(new Error('synthetic inventory failure'),{code:'MANGER_INSTANCE_TOOL'});
  }));
  let day=1;
  const run=options=>automaticBackup(config,{directory,toolsDirectory:'synthetic',applicationRole:'app',instance:'synthetic-instance',now:new Date(Date.UTC(2026,0,day++)),...options});
  const complete=async()=>{const names=await fs.readdir(directory);const result=[];for(const name of names){try{await fs.access(join(directory,name,'automatic.json'));result.push(name);}catch{}}return result.sort();};
  return {root,directory,run,complete,get calls(){return calls;},fail:value=>failure=value};
}

test('automatic backup retains seven completed archives and ignores manual folders',async t=>{
  const f=await fixture(t);await f.run();await fs.mkdir(join(f.directory,'manual'));await fs.writeFile(join(f.directory,'manual/important'),'keep');
  for(let i=1;i<9;i++)await f.run();
  assert.equal((await f.complete()).length,7);assert.equal(await fs.readFile(join(f.directory,'manual/important'),'utf8'),'keep');
  assert.equal((await fs.stat(f.directory)).isDirectory(),true);
  await assert.rejects(fs.access(join(f.directory,'.lock')),{code:'ENOENT'});
});

for(const failure of ['dump','inventory'])test('failed '+failure+' never prunes the last good backup',async t=>{
  const f=await fixture(t);const previous=await f.run({keep:1});f.fail(failure);
  await assert.rejects(f.run({keep:1}));assert.deepEqual(await f.complete(),[previous.archive]);
  assert.equal((await fs.readdir(f.directory)).filter(name=>name.startsWith('auto-')).length,2);
  await assert.rejects(fs.access(join(f.directory,'.lock')),{code:'ENOENT'});
});

test('corruption in a retained archive aborts all pruning of older good backups',async t=>{
  const f=await fixture(t),first=await f.run(),second=await f.run();
  await fs.appendFile(join(f.directory,second.archive,'database.dump'),'corrupted');
  await assert.rejects(f.run({keep:2}),{code:'MANGER_AUTO_ARCHIVE'});
  assert.equal(await fs.readFile(join(f.directory,first.archive,'database.dump'),'utf8'),'synthetic dump 1');
  assert.equal((await f.complete()).length,3);
});

test('unexpected files in a completed folder are never recursively removed',async t=>{
  const f=await fixture(t),first=await f.run();await fs.writeFile(join(f.directory,first.archive,'unexpected-private.key'),'keep');
  await assert.rejects(f.run({keep:1}),{code:'MANGER_AUTO_ARCHIVE'});
  assert.equal(await fs.readFile(join(f.directory,first.archive,'unexpected-private.key'),'utf8'),'keep');
});

test('old exclusive locks are not reclaimed by their age',async t=>{
  const f=await fixture(t);await f.run();await fs.writeFile(join(f.directory,'.lock'),'old lock');
  await fs.utimes(join(f.directory,'.lock'),new Date(0),new Date(0));const before=f.calls;
  await assert.rejects(f.run(),{code:'EEXIST'});assert.equal(f.calls,before);
  assert.equal(await fs.readFile(join(f.directory,'.lock'),'utf8'),'old lock');
});

test('clock rollback cannot rotate away the backup that has just succeeded',async t=>{
  const f=await fixture(t);await f.run({now:new Date('2030-01-01T00:00:00Z')});await f.run({now:new Date('2031-01-01T00:00:00Z')});
  const current=await f.run({keep:2,now:new Date('2020-01-01T00:00:00Z')});assert.ok((await f.complete()).includes(current.archive));
  assert.equal((await f.complete()).length,2);
});

test('a foreign automatic root is refused before making any backup',async t=>{
  const f=await fixture(t);await f.run();const before=f.calls;
  await assert.rejects(f.run({instance:'another-instance'}),{code:'MANGER_AUTO_OWNER'});assert.equal(f.calls,before);
});

test('symlinked automatic roots are refused without touching their destination',async t=>{
  const f=await fixture(t),outside=join(f.root,'outside');await fs.mkdir(outside);await fs.writeFile(join(outside,'important'),'keep');
  await fs.symlink(outside,f.directory,process.platform==='win32'?'junction':'dir');
  await assert.rejects(f.run(),{code:'MANGER_AUTO_DIRECTORY'});assert.equal(f.calls,0);
  assert.equal(await fs.readFile(join(outside,'important'),'utf8'),'keep');
});

test('symlinked archive directories do not allow rotation outside the automatic root',async t=>{
  const f=await fixture(t),first=await f.run(),outside=join(f.root,'outside');
  await fs.rename(join(f.directory,first.archive),outside);await fs.symlink(outside,join(f.directory,first.archive),process.platform==='win32'?'junction':'dir');
  await assert.rejects(f.run({keep:1}),{code:'MANGER_AUTO_ARCHIVE'});
  assert.equal(await fs.readFile(join(outside,'database.dump'),'utf8'),'synthetic dump 1');
});

test('invalid retention bounds are refused before allocating the backup root',async t=>{
  const f=await fixture(t);for(const keep of [0,91,1.5,'7'])await assert.rejects(f.run({keep}),{code:'MANGER_AUTO_CONFIG'});
  assert.equal(f.calls,0);await assert.rejects(fs.access(f.directory),{code:'ENOENT'});
});

test('first completed backup synchronizes the parent that owns the automatic root',async t=>{
  const f=await fixture(t),synced=[],original=tools.syncDirectory;
  t.mock.method(tools,'syncDirectory',async path=>{synced.push(path);await original(path);});
  await f.run();assert.ok(synced.includes(f.root));
});
