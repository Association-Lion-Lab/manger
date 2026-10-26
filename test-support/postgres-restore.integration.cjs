const test=require('node:test'),assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {mkdtemp,readFile,readdir,rm}=require('node:fs/promises');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {databaseFixture}=require('./database');
const {migrationSourceFixture}=require('./migration-source-fixture');
const {analyzeSource}=require('../migration-source');
const {migratePostgres}=require('../migrate-postgres');
const {readPostgresTables,verifyMigration}=require('../migration-verify');
const {encodeHousehold,decodeHousehold}=require('../household-backup');
const {createPostgresRestore}=require('../postgres-restore');
const {postgresRepositories}=require('../db/repositories');
const {createBusinessHandler}=require('../server');
const {protectAccounts}=require('../accounts');
const {createServer}=require('node:http');
const {householdHttp}=require('./household-http');

test('restauration du foyer PostgreSQL réel',{timeout:90000},async t=>{
  const f=await databaseFixture(t),db=f.database,fixture=await migrationSourceFixture(t),source=await analyzeSource(fixture);
  await migratePostgres(f.migrationPool,source);
  const folder=await mkdtemp(join(tmpdir(),'manger-restore-test-'));t.after(()=>rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const expected=Object.fromEntries(Object.entries(source.tables).filter(([k])=>k.startsWith('household.'))),bytes=encodeHousehold(expected);
  const current=async()=>readPostgresTables(db,{includeAuth:false});
  const check=async()=>assert.equal(verifyMigration(expected,await current(),{includeAuth:false}).tables,18);
  const authBefore=(await readPostgresTables(db));for(const k of Object.keys(authBefore).filter(k=>k.startsWith('household.')))delete authBefore[k];
  let clock=Date.now();const restore=createPostgresRestore(db,{recoveryDirectory:join(folder,'recovery'),now:()=>clock});t.after(()=>restore.clear());
  const preview=input=>restore.preview(Readable.from([input]));
  await t.test('aperçu borné, version inconnue et jeton expiré refusés sans mutation',async()=>{
    for(const input of [Buffer.from('{}'),Buffer.from('SELECT 1'),Buffer.alloc(32*1024*1024+1)])await assert.rejects(preview(input));
    const p=await preview(bytes);assert.equal(p.recipes,expected['household.recipes'].length);assert.equal(p.members,expected['household.members'].length);
    clock+=600001;await assert.rejects(restore.apply(p.token),{code:'MANGER_RESTORE_EXPIRED'});await check();
  });
  await t.test('JSON complet, copie préalable, comptes inchangés et identifiants recalés',async()=>{
    await db.query("UPDATE household.recipes SET title='Avant restauration'");
    const previous=await current(),p=await preview(bytes),result=await restore.apply(p.token);assert.equal(result.restored,true);await check();
    const saved=decodeHousehold(await readFile(join(folder,result.recovery)));assert.equal(verifyMigration(previous,saved.tables,{includeAuth:false}).tables,18);
    await assert.rejects(restore.apply(p.token),{code:'MANGER_RESTORE_EXPIRED'});
    for(const [k,rows]of Object.entries(authBefore))assert.deepEqual((await readPostgresTables(db))[k],rows,k);
    const row=(await db.query("INSERT INTO household.recipes(title,minutes,servings) VALUES('Après restauration',1,1) RETURNING id::float8 AS id")).rows[0];
    assert.ok(row.id>Math.max(...expected['household.recipes'].map(r=>r.id)));await db.query('DELETE FROM household.recipes WHERE id=$1',[row.id]);await check();
    await assert.rejects(db.query("ALTER SEQUENCE household.recipes_id_seq RESTART WITH 1"),{code:'42501'});
    await assert.rejects(db.query("SELECT setval('auth.accounts_id_seq',1)"),{code:'42501'});
  });
  await t.test('ancienne sauvegarde SQLite normalisée sans altérer le fichier',async()=>{
    const old=await readFile(fixture.home),p=await preview(old);await restore.apply(p.token);await check();assert.deepEqual(await readFile(fixture.home),old);
  });
  await t.test('erreur après insertions et recalage annule données ET séquences',async()=>{
    const before=await current(),seq=(await f.migrationPool.query('SELECT last_value,is_called FROM household.recipes_id_seq')).rows[0];let injected=false;
    const broken=createPostgresRestore({...db,transaction:work=>db.transaction(tx=>work({query:async(sql,args)=>{const result=await tx.query(sql,args);if(sql==='SELECT household.restart_sequences()'){injected=true;await tx.query('SELECT 1/0');}return result;}}))},{recoveryDirectory:join(folder,'recovery')});
    const changed=structuredClone(expected);changed['household.recipes'][0].title='À annuler';
    // structuredClone turns Buffers into Uint8Arrays; preserve the original binary rows.
    changed['household.recipe_photos']=expected['household.recipe_photos'];changed['household.pantry']=expected['household.pantry'];
    const p=await broken.preview(Readable.from([encodeHousehold(changed)]));await assert.rejects(broken.apply(p.token),{code:'22012'});assert.equal(injected,true);
    assert.equal(verifyMigration(before,await current(),{includeAuth:false}).tables,18);assert.deepEqual((await f.migrationPool.query('SELECT last_value,is_called FROM household.recipes_id_seq')).rows[0],seq);await broken.clear();
  });
  await t.test('copie impossible refuse avant suppression et conserve le foyer',async()=>{
    const {writeFile}=require('node:fs/promises'),occupied=join(folder,'occupied');await writeFile(occupied,'fichier');
    const broken=createPostgresRestore(db,{recoveryDirectory:occupied}),p=await broken.preview(Readable.from([bytes]));await assert.rejects(broken.apply(p.token));await check();await broken.clear();
  });
  await t.test('trigger ajouté refusé avant suppression, comptes et foyer conservés',async()=>{
    const owner=f.migrationPool;
    await owner.query("CREATE FUNCTION household.forbidden_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN UPDATE auth.accounts SET active=0; RETURN OLD; END $$; CREATE TRIGGER forbidden BEFORE DELETE ON household.recipes FOR EACH ROW EXECUTE FUNCTION household.forbidden_trigger()");
    try{const p=await preview(bytes);await assert.rejects(restore.apply(p.token),{code:'MANGER_STRUCTURE_INVALID'});await check();assert.equal((await db.query("SELECT active FROM auth.accounts WHERE username='admin'")).rows[0].active,1);}
    finally{await owner.query('DROP TRIGGER forbidden ON household.recipes; DROP FUNCTION household.forbidden_trigger()');}
  });
  await t.test('phase disque au-delà de dix secondes reste sous un délai explicite',async()=>{
    let paused=false;const slow=createPostgresRestore({...db,transaction:work=>db.transaction(tx=>work({query:async(sql,args)=>{const value=await tx.query(sql,args);if(!paused&&sql.endsWith('FROM household.week_templates')){paused=true;await new Promise(r=>setTimeout(r,10500));}return value;}}))},{recoveryDirectory:join(folder,'recovery')});
    const p=await slow.preview(Readable.from([bytes]));assert.equal((await slow.apply(p.token)).restored,true);assert.equal(paused,true);await check();await slow.clear();
  });
  await t.test('vrai COMMIT puis réponse perdue : état confirmé par lecture, aucun réessai',async()=>{
    const {Client}=require('pg'),original=Client.prototype.query;let injected=false;
    const changed=decodeHousehold(bytes).tables;changed['household.recipes'][0].title='Engagement confirmé par lecture';
    const p=await preview(encodeHousehold(changed));
    Client.prototype.query=function(sql,args){const result=original.call(this,sql,args);if(sql==='COMMIT'&&this.user===f.config.user&&!injected)return result.then(()=>{injected=true;throw Object.assign(new Error('private lost reply'),{code:'ECONNRESET'});});return result;};
    try{await assert.rejects(restore.apply(p.token),e=>e.code==='POSTGRES_COMMIT_UNCERTAIN'&&/^recovery\//.test(e.recovery));}
    finally{Client.prototype.query=original;}
    assert.equal(injected,true);assert.equal(verifyMigration(changed,await current(),{includeAuth:false}).tables,18);await assert.rejects(restore.apply(p.token),{code:'MANGER_RESTORE_EXPIRED'});
    const reset=await preview(bytes);await restore.apply(reset.token);await check();
  });
  await t.test('administrateur révoqué pendant attente refusé avant suppression',async()=>{
    const stores=postgresRepositories(db),user=await stores.auth.session(require('node:crypto').createHash('sha256').update(fixture.token).digest('hex'));
    const p=await preview(bytes);await db.query('UPDATE auth.accounts SET active=0 WHERE id=$1',[user.id]);
    try{await assert.rejects(restore.apply(p.token,{authorize:tx=>stores.auth.authorizeRestore(tx,user)}),{code:'MANGER_RESTORE_FORBIDDEN'});await check();}
    finally{await db.query('UPDATE auth.accounts SET active=1 WHERE id=$1',[user.id]);}
  });
  await t.test('HTTP protégé et double application refusée pendant remplacement',async()=>{
    const stores=postgresRepositories(db);let entered,release,hold=false;stores.restoration={preview:request=>restore.preview(request),apply:async(token,options)=>{if(hold){entered();await new Promise(r=>release=r);}return restore.apply(token,options);}};
    const server=createServer(protectAccounts(null,createBusinessHandler(stores),{auth:stores.auth,backupReady:true,restoreReady:true}));await householdHttp(t,server);
    const base=`http://127.0.0.1:${server.address().port}`,cookie='manger_session='+fixture.token;
    const request=(path,data,options={})=>fetch(base+path,{method:'POST',headers:{Origin:base,Cookie:cookie,'X-Manger-Restore':'1',...options},body:data,signal:AbortSignal.timeout(10000)});
    assert.equal((await request('/api/restore/preview',bytes,{Cookie:''})).status,401);
    assert.equal((await request('/api/restore/preview',bytes,{'X-Manger-Restore':'0'})).status,403);
    assert.equal((await request('/api/restore/preview',bytes,{Origin:'https://other.invalid'})).status,403);
    const p=await(await request('/api/restore/preview',bytes)).json(),ready=new Promise(r=>entered=r);hold=true;
    const applying=request('/api/restore/apply',JSON.stringify({token:p.token}));await ready;
    assert.equal((await request('/api/restore/apply',JSON.stringify({token:p.token}))).status,503);
    assert.equal((await fetch(base+'/api/recipes',{headers:{Cookie:cookie}})).status,503);hold=false;release();assert.equal((await applying).status,200);await check();
    assert.equal((await request('/api/restore/apply',JSON.stringify({token:p.token}))).status,400);
  });
  assert.ok((await readdir(join(folder,'recovery'))).length>=4);
});
