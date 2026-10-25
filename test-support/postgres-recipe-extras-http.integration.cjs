const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {databaseFixture}=require('./database');
const {postgresRecipes}=require('../db/recipes');
const {postgresAuth}=require('../db/auth');
const {lockHousehold}=require('../db/household');
const {createRecipeHandler}=require('../server');
const {openAccounts,createAccount,protectAccounts}=require('../accounts');
const {createRecipePreview}=require('../recipe-preview');
const {importUrl}=require('../recipe-import');
const {recipeDraft}=require('./recipe-fixture');
const {householdHttp}=require('./household-http');
const {extrasHttpContract}=require('./recipe-extras-http-contract');

test('enrichissements/imports : HTTP PostgreSQL réel protégé',{timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,legacy=openAccounts(':memory:');let failing=false;
  try {await createAccount(legacy,'member','long-password-member',false);const row=legacy.prepare('SELECT * FROM accounts').get();
    await db.query('INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,$3)',[row.username,row.password,row.admin]);
  } finally {legacy.close();}
  const failure=()=>db.query('SELECT private_password FROM household.nonexistent');
  const store=postgresRecipes({...db,query:(...args)=>failing?failure():db.query(...args),transaction:work=>failing?failure():db.transaction(work)});
  let calls=0,finish,announce;const entered=new Promise(resolve=>{announce=resolve;});
  const preview=createRecipePreview({download:async value=>{
    const url=importUrl(value);calls++;
    if(url.pathname==='/hold'){announce();await new Promise(resolve=>{finish=resolve;});}
    if(url.pathname==='/error')throw new Error('native-private-detail');
    return {sourceUrl:url.href,html:'<script type="application/ld+json">'+JSON.stringify({'@type':'Recipe',name:'Riz',totalTime:'PT10M',recipeYield:'2',recipeIngredient:['200 g de riz'],recipeInstructions:'Cuire le riz.'})+'</script>'};
  }});
  const server=createServer(protectAccounts(null,createRecipeHandler(store,{preview}),{auth:postgresAuth(db)})),http=await householdHttp(t,server);
  try {
  await extrasHttpContract(t,{...http,read:store.read,failDatabase(){failing=true;return()=>{failing=false;};},
    seedLegacyIds:()=>db.query("INSERT INTO household.recipes(id,title,minutes,servings,diet) VALUES(0,'Zero',1,1,'vegan'),(5000000001,'Large',1,1,'vegan')")});
  await t.test('aperçu URL HTTP : garde simultanée, pas de verrou SQL, erreurs privées et reprise',async()=>{
    const cookie=await http.login(),before=await store.read();
    const send=value=>http.request('/api/recipes/import-preview','POST',value,cookie);
    const pending=send({kind:'url',url:'https://example.org/hold'});
    try {
      await entered;assert.equal((await send({kind:'url',url:'https://example.org/ok'})).status,400);assert.equal(calls,1);
      assert.equal((await send({kind:'file',data:{format:'manger-recipes',version:1,recipes:[recipeDraft()]}})).status,200);
      await db.transaction(tx=>lockHousehold(tx));
    } finally {finish?.();}
    const result=await pending;assert.equal(result.status,200);assert.equal((await result.json()).recipes[0].title,'Riz');
    const broken=await send({kind:'url',url:'https://example.org/error'});assert.equal(broken.status,503);assert.doesNotMatch(await broken.text(),/native-private-detail/);
    assert.equal((await send({kind:'url',url:'https://example.org/ok'})).status,200);assert.equal(calls,3);assert.deepEqual(await store.read(),before);
  });
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
