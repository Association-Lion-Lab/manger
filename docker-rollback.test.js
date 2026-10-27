const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,readFile,writeFile,chmod,rm}=require('node:fs/promises');
const {join}=require('node:path'),{tmpdir}=require('node:os');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const {migrationSourceFixture}=require('./test-support/migration-source-fixture');
const {openAccounts}=require('./accounts');

async function run(scriptName,folder){
  const script=await readFile('scripts/'+scriptName,'utf8');
  const child=spawn(process.execPath,[],{env:{...process.env,MANGER_PROBE_MODE:'sqlite-return',MANGER_PROBE_SOURCE_DIR:folder},stdio:['pipe','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  child.stdin.end(script);
  const timer=setTimeout(()=>child.kill(),30000);
  try{return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve({code,output}));});}
  finally{clearTimeout(timer);}
}
const probe=folder=>run('postgres-image-probe.js',folder);
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');

test('sonde de retour SQLite : copie complète, accès et sources inchangées',{timeout:45000},async t=>{
  const source=await migrationSourceFixture(t),before=await Promise.all([hash(source.home),hash(source.accounts)]);
  await chmod(source.home,0o444);await chmod(source.accounts,0o444);
  const result=await probe(source.folder);
  assert.equal(result.code,0,result.output);
  assert.match(result.output,/Retour SQLite vérifié : compte, 18 tables et sources inchangées/);
  assert.deepEqual(await Promise.all([hash(source.home),hash(source.accounts)]),before);
});

test('sonde de retour SQLite : une source invalide fait échouer le scénario',{timeout:45000},async t=>{
  const folder=await mkdtemp(join(tmpdir(),'manger-return-invalid-'));
  t.after(()=>rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  await writeFile(join(folder,'manger.db'),'invalid synthetic database');
  await writeFile(join(folder,'accounts.db'),'invalid synthetic accounts');
  const result=await probe(folder);
  assert.equal(result.code,1,result.output);
  assert.doesNotMatch(result.output,/Retour SQLite vérifié/);
  assert.equal(await readFile(join(folder,'manger.db'),'utf8'),'invalid synthetic database');
  assert.equal(await readFile(join(folder,'accounts.db'),'utf8'),'invalid synthetic accounts');
});

test('sonde de retour SQLite : la source du scénario Docker est réutilisable',{timeout:45000},async t=>{
  const folder=await mkdtemp(join(tmpdir(),'manger-docker-return-'));
  t.after(()=>rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const created=await run('postgres-test-source.js',folder);
  assert.equal(created.code,0,created.output);
  await chmod(join(folder,'manger.db'),0o444);await chmod(join(folder,'accounts.db'),0o444);
  const before=await Promise.all(['manger.db','accounts.db'].map(file=>hash(join(folder,file))));
  const result=await probe(folder);
  assert.equal(result.code,0,result.output);
  assert.match(result.output,/Retour SQLite vérifié/);
  assert.deepEqual(await Promise.all(['manger.db','accounts.db'].map(file=>hash(join(folder,file)))),before);
});

test('sonde de retour SQLite : un accès absent est refusé sans toucher aux sources',{timeout:45000},async t=>{
  const source=await migrationSourceFixture(t),access=openAccounts(source.accounts);
  try{access.exec('DELETE FROM sessions');}finally{access.close();}
  const before=await Promise.all([hash(source.home),hash(source.accounts)]),result=await probe(source.folder);
  assert.equal(result.code,1,result.output);
  assert.doesNotMatch(result.output,/Retour SQLite vérifié/);
  assert.deepEqual(await Promise.all([hash(source.home),hash(source.accounts)]),before);
});
