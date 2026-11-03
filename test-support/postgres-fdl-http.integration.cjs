const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {createHash}=require('node:crypto');
const {databaseFixture}=require('./database');
const {migrationSourceFixture}=require('./migration-source-fixture');
const {analyzeSource}=require('../migration-source');
const {migratePostgres}=require('../migrate-postgres');
const {postgresRepositories}=require('../db/repositories');
const {protectAccounts}=require('../accounts');
const {createBusinessHandler}=require('../server');
const {fdlRoutes}=require('../fdl-http');
const {fdlClient,checkCopies}=require('../fdl');
const {startFakeFdl,projection}=require('./fdl-fake');

test('FDL HTTP PostgreSQL : liaison liée au navigateur, import et pannes',{timeout:90000},async t=>{
  const f=await databaseFixture(t),fixture=await migrationSourceFixture(t);await migratePostgres(f.migrationPool,await analyzeSource(fixture));
  const stores=postgresRepositories(f.database),fake=await startFakeFdl();t.after(fake.close);let clock=Date.now();
  const sendJson=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const client=fdlClient(fake.url),fdl=fdlRoutes({store:stores.fdl,auth:stores.auth,base:fake.url,client,sendJson,now:()=>clock});
  const business=createBusinessHandler(stores),handler=async(req,res,context)=>{if(await fdl.handle(req,res,context))return;return business(req,res,context);};
  const server=createServer(protectAccounts(null,handler,{auth:stores.auth,fdlEnabled:true,fdlCallback:fdl.callback}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{fdl.close();server.closeAllConnections();return new Promise(r=>server.close(r));});
  const base=`http://127.0.0.1:${server.address().port}`,admin='manger_session='+fixture.token;
  const request=(path,method='GET',value,cookie=admin)=>fetch(base+path,{method,redirect:'manual',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:value===undefined?undefined:JSON.stringify(value)});
  const start=async()=>{const response=await request('/api/fdl/relier','POST',{});assert.equal(response.status,200);return {url:new URL((await response.json()).url),cookie:response.headers.get('set-cookie').split(';')[0]};};
  const calls=()=>fake.calls.filter(c=>c.path==='/oauth/jeton').length;
  await t.test('liaison réservée à l’administrateur, lectures aux membres et aucune lecture anonyme',async()=>{
    const member=(await f.database.query("INSERT INTO auth.accounts(username,password,admin) SELECT 'lecteur',password,0 FROM auth.accounts WHERE admin=1 RETURNING id")).rows[0].id;
    await f.database.query('INSERT INTO auth.sessions(token,account_id,expires) VALUES($1,$2,$3)',[createHash('sha256').update('d'.repeat(64)).digest('hex'),member,Date.now()+60000]);
    const cookie='manger_session='+'d'.repeat(64);
    assert.equal((await request('/api/fdl/etat','GET',undefined,'')).status,401);
    assert.equal((await request('/api/fdl/etat','GET',undefined,cookie)).status,200);
    assert.equal((await request('/api/fdl/relier','POST',{},cookie)).status,403);
    assert.equal((await request('/api/fdl/lien','DELETE',undefined,cookie)).status,403);
    assert.equal(calls(),0);
  });
  await t.test('state inconnu, mauvais navigateur, expiré et réutilisé ne stockent rien',async()=>{
    assert.equal((await request('/api/fdl/retour?state=inconnu&code=x')).status,400);assert.equal(calls(),0);
    const first=await start(),state=first.url.searchParams.get('state');
    assert.equal((await request('/api/fdl/retour?state='+state+'&code=x','GET',undefined,'')).status,400);assert.equal(calls(),0);
    clock+=600001;assert.equal((await request('/api/fdl/retour?state='+state+'&code=x','GET',undefined,first.cookie)).status,400);assert.equal(calls(),0);
    const revoked=await start(),revokedUrl='/api/fdl/retour?state='+revoked.url.searchParams.get('state')+'&code=x';
    await f.database.query('UPDATE auth.accounts SET active=0 WHERE admin=1');
    try{assert.equal((await request(revokedUrl,'GET',undefined,revoked.cookie)).status,400);assert.equal(calls(),0);}
    finally{await f.database.query('UPDATE auth.accounts SET active=1 WHERE admin=1');}
    const next=await start(),query='/api/fdl/retour?state='+next.url.searchParams.get('state')+'&code=authorization-code';
    const parallel=await Promise.all([request(query,'GET',undefined,next.cookie),request(query,'GET',undefined,next.cookie)]);
    assert.deepEqual(parallel.map(r=>r.status).sort(),[200,400]);
    const returned=parallel.find(r=>r.status===200);assert.doesNotMatch(await returned.text(),/test-token/);
    assert.equal(createHash('sha256').update(fake.lastExchange.code_verifier).digest('base64url'),next.url.searchParams.get('code_challenge'));
    assert.equal((await request(query,'GET',undefined,next.cookie)).status,400);assert.equal(calls(),1);
    const down=await start();fake.mode='secret-error';
    const response=await request('/api/fdl/retour?state='+down.url.searchParams.get('state')+'&code=x','GET',undefined,down.cookie);
    assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/test-token/);fake.mode='normal';
  });
  await t.test('délier invalide une demande de liaison en attente',async()=>{
    const flow=await start();assert.equal((await request('/api/fdl/lien','DELETE')).status,200);
    const before=calls();assert.equal((await request('/api/fdl/retour?state='+flow.url.searchParams.get('state')+'&code=x','GET',undefined,flow.cookie)).status,400);
    assert.equal(calls(),before);assert.equal(await stores.fdl.link(),null);
    const retry=await start();assert.equal((await request('/api/fdl/retour?state='+retry.url.searchParams.get('state')+'&code=x','GET',undefined,retry.cookie)).status,200);
  });
  await t.test('état sans jeton, recettes privées partagées, import valide puis doublon',async()=>{
    const state=await request('/api/fdl/etat');assert.equal(state.status,200);assert.doesNotMatch(await state.text(),/test-token|access_token/);
    assert.equal((await request('/api/fdl/mes-recettes')).status,200);
    assert.equal((await request('/api/fdl/import','POST',{lien:'12'})).status,201);
    assert.equal((await request('/api/fdl/import','POST',{lien:'12'})).status,409);
    assert.equal((await request('/api/fdl/import','POST',{lien:'https://evil.example/recette?id=12'})).status,400);
  });
  await t.test('validation 400 avant toute écriture, panne 502 sans copie touchée',async()=>{
    fake.recipes.set('13',projection({id:13,url:fake.url+'/recette?id=13',steps:Array(51).fill({kind:'cook',instruction:'Cuire.'})}));
    const before=await stores.recipes.read();assert.equal((await request('/api/fdl/import','POST',{lien:'13'})).status,400);
    fake.recipes.set('15',projection({id:15,url:fake.url+'/recette?id=15',ingredients:[{name:'Carotte',amount:2,unit:'g'},{name:'carotte',amount:1,unit:'g'}]}));
    assert.equal((await request('/api/fdl/import','POST',{lien:'15'})).status,400);
    assert.deepEqual(await stores.recipes.read(),before);
    fake.mode='secret-error';const bad=await request('/api/fdl/recettes');assert.equal(bad.status,502);assert.doesNotMatch(await bad.text(),/test-token/);
    await assert.rejects(checkCopies({store:stores.fdl,client}));assert.deepEqual(await stores.recipes.read(),before);
    fake.mode='normal';
  });
  await t.test('auteur supprimé conservé, retrait modération appliqué, liaison révoquée oubliée',async()=>{
    fake.states['12']={state:'not_found'};await checkCopies({store:stores.fdl,client});assert.equal((await stores.fdl.copies()).length,1);
    fake.states['12']={state:'removed'};await checkCopies({store:stores.fdl,client});assert.equal((await stores.fdl.copies()).length,0);
    assert.equal((await stores.fdl.notices()).length,1);
    fake.mode='unauthorized';assert.equal((await request('/api/fdl/recettes')).status,409);assert.equal(await stores.fdl.link(),null);
  });
});
