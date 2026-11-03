const test=require('node:test'),assert=require('node:assert/strict');
const {fdlUrl,fdlId,fdlRecipe,fdlClient,checkCopies}=require('./fdl');
const {validateRecipe}=require('./recipe');
const {startFakeFdl,projection}=require('./test-support/fdl-fake');
test('FDL : configuration et projection revalidée localement',()=>{
  assert.equal(fdlUrl({}),null);assert.equal(fdlUrl({MANGER_FDL_URL:'https://fdl.example'}),'https://fdl.example');
  for(const value of ['https://fdl.example/path','https://user:secret@fdl.example','javascript:x'])assert.throws(()=>fdlUrl({MANGER_FDL_URL:value}));
  assert.equal(fdlId('12','https://fdl.example'),'12');assert.equal(fdlId('https://fdl.example/recette?id=12','https://fdl.example'),'12');
  assert.equal(fdlId('https://other.example/recette?id=12','https://fdl.example'),null);
  const recipe=validateRecipe(fdlRecipe({...projection(),ingredients:[{name:'Carotte',amount:2,unit:'',preparation:'raw'}]}));
  assert.equal(recipe.ingredients[0].unit,'pièce');assert.throws(()=>validateRecipe(fdlRecipe({...projection(),steps:Array(51).fill({kind:'cook',instruction:'Cuire.'})})));
});
test('FDL : faux serveur, panne, redirection et réponses privées bornées',async t=>{
  const fake=await startFakeFdl();t.after(fake.close);const client=fdlClient(fake.url);
  assert.equal((await client.get('/api/v1/recette?id=12','test-token')).id,12);
  fake.mode='redirect';await assert.rejects(client.get('/api/v1/recette?id=12','test-token'),{status:502});
  fake.mode='secret-error';await assert.rejects(client.get('/api/v1/recette?id=12','test-token'),e=>e.status===502&&!e.message.includes('test-token'));
});
test('FDL : tous les lots sont lus avant toute modification des copies',async()=>{
  let changed=0,calls=0;const link={origin:'https://fdl.example',token:'secret'};
  const store={link:async()=>link,copies:async()=>Array.from({length:101},(_,i)=>({recipeId:i+1,fdlId:String(i+1),origin:link.origin,removed:false})),applyStates:async()=>changed++};
  const client={get:async()=>{if(++calls===2)throw Object.assign(new Error('FDL indisponible'),{status:502});return {'1':{state:'removed'}};}};
  await assert.rejects(checkCopies({store,client}));
  assert.equal(changed,0);
});
test('FDL : les routes restent en 404 sous SQLite, sans compte et sans table ajoutée',async t=>{
  const {createApp,createDatabase}=require('./server'),{openAccounts}=require('./accounts');
  const db=createDatabase(':memory:'),accounts=openAccounts(':memory:'),server=createApp(db,accounts);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();accounts.close();});
  const base='http://127.0.0.1:'+server.address().port;
  for(const path of ['/api/fdl/etat','/api/fdl/retour?state=x&code=x'])assert.equal((await fetch(base+path)).status,404);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE 'fdl_%'").get().n,0);
});
