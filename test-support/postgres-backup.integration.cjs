const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {databaseFixture}=require('./database');
const {migrationSourceFixture}=require('./migration-source-fixture');
const {analyzeSource}=require('../migration-source');
const {migratePostgres}=require('../migrate-postgres');
const {verifyMigration}=require('../migration-verify');
const {postgresRepositories}=require('../db/repositories');
const {postgresHouseholdBackup,decodeHousehold,backupError}=require('../household-backup');
const {protectAccounts}=require('../accounts');
const {createBusinessHandler}=require('../server');
const {householdHttp}=require('./household-http');
test('sauvegarde du foyer PostgreSQL réel',{timeout:60000},async t=>{
  const f=await databaseFixture(t),fixture=await migrationSourceFixture(t),source=await analyzeSource(fixture),db=f.database;await migratePostgres(f.migrationPool,source);
  const expected=Object.fromEntries(Object.entries(source.tables).filter(([key])=>key.startsWith('household.'))),backup=postgresHouseholdBackup(db);
  await t.test('18 tables et octets complets, aucun accès dans le fichier',async()=>{
    const bytes=await backup(),decoded=decodeHousehold(bytes);assert.equal(verifyMigration(expected,decoded.tables,{includeAuth:false}).tables,18);assert.equal(Object.keys(decoded.tables).length,18);
    assert.equal(JSON.parse(bytes).format,'manger-household');
  });
  await t.test('toutes les tables gardent la photographie même si deux données changent ensemble',async()=>{
    let entered,release,paused=false;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
    const capture=postgresHouseholdBackup({...db,transaction:work=>db.transaction(tx=>work({query:async(sql,args)=>{const result=await tx.query(sql,args);if(!paused&&sql.endsWith('FROM household.recipes')){paused=true;entered();await gate;}return result;}}))});
    const pending=capture();await ready;
    try{await db.transaction(async tx=>{await tx.query("UPDATE household.recipes SET title='Modifiée'");await tx.query("UPDATE household.recipe_notes SET note='Modifié'");});}finally{release();}
    const decoded=decodeHousehold(await pending);assert.equal(decoded.tables['household.recipes'][0].title,expected['household.recipes'][0].title);assert.equal(decoded.tables['household.recipe_notes'][0].note,'Avis synthétique');
  });
  await t.test('HTTP administrateur explicite, envoi unique et erreurs privées',async()=>{
    const stores=postgresRepositories(db);let mode='normal',entered,release;
    stores.backup=async()=>{if(mode==='fail')return db.query('SELECT private_password FROM household.absent');if(mode==='large')throw backupError('MANGER_BACKUP_TOO_LARGE');if(mode==='hold'){entered();await new Promise(r=>release=r);}return backup();};
    const server=createServer(protectAccounts(null,createBusinessHandler(stores),{auth:stores.auth,backupReady:true})),http=await householdHttp(t,server),cookie='manger_session='+fixture.token;
    const request=(cookieValue=cookie,header=true)=>fetch(`http://127.0.0.1:${server.address().port}/api/backup`,{headers:{...(cookieValue?{Cookie:cookieValue}:{}),...(header?{'X-Manger-Backup':'1'}:{})}});
    assert.equal((await request(null)).status,401);assert.equal((await request(cookie,false)).status,403);
    const member=(await db.query("INSERT INTO auth.accounts(username,password,admin) SELECT 'member',password,0 FROM auth.accounts WHERE username='admin' RETURNING id::float8 AS id")).rows[0];
    await db.query('INSERT INTO auth.sessions VALUES($1,$2,$3)',[require('node:crypto').createHash('sha256').update('f'.repeat(64)).digest('hex'),member.id,Date.now()+60000]);assert.equal((await request('manger_session='+'f'.repeat(64))).status,403);
    let response=await request();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-disposition'),/^attachment; filename="manger-\d{4}-\d{2}-\d{2}\.json"$/);assert.equal(Object.keys(decodeHousehold(Buffer.from(await response.arrayBuffer())).tables).length,18);
    mode='hold';const ready=new Promise(r=>entered=r),pending=request();await ready;assert.equal((await request()).status,409);release();response=await pending;assert.equal(response.status,200);await response.arrayBuffer();
    mode='fail';response=await request();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private|password|SELECT|absent/);
    mode='large';assert.equal((await request()).status,413);mode='normal';assert.equal((await request()).status,200);
    assert.equal((await http.request('/api/restore/preview','POST',{},cookie)).status,503);
  });
});
