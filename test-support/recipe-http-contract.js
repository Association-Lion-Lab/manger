const assert=require('node:assert/strict');
const {recipeDraft}=require('./recipe-fixture');

async function recipeContract(t,{request,login,read,failWrite,seedPlanning,mealTitle,clearPlanning,seedLegacyIds}) {
  let cookie,first,other;
  const send=(path,method,data)=>request(path,method,data,cookie);
  await t.test('écriture protégée par compte et origine, autorisée au membre',async()=>{
    for(const [path,method] of [['/api/recipes','POST'],['/api/recipes/1','PUT'],['/api/recipes/1','DELETE']])assert.equal((await request(path,method,recipeDraft())).status,401);
    cookie=await login();assert.equal((await request('/api/recipes','POST',recipeDraft(),cookie,'https://untrusted.invalid')).status,403);
    assert.deepEqual(await read(),[]);
  });
  await t.test('création avec réponse complète, sans exposer les octets photo',async()=>{
    const r=await send('/api/recipes','POST',recipeDraft({photo:'data:image/jpeg;base64,/9j/2Q=='}));assert.equal(r.status,201);first=await r.json();
    assert.ok(Number.isSafeInteger(first.id));assert.equal(first.title,'Œufs aux tomates');assert.deepEqual(first.tags,['japon','été']);
    assert.equal(first.favorite,false);assert.equal(first.hasPhoto,true);assert.ok(!Object.hasOwn(first,'photo'));assert.ok(!Object.hasOwn(first,'note'));
    assert.deepEqual(first.ingredients,[{name:'tomate',unit:'g',amount:120.125,preparation:'cooked'},{name:'œuf',unit:'pièce',amount:2.375,preparation:'raw'}]);
    assert.deepEqual(first.steps.map(s=>s.position),[1,2]);assert.deepEqual(await read(),[first]);
  });
  await t.test('titres non uniques, édition complète et options photo historiques',async()=>{
    const r=await send('/api/recipes','POST',recipeDraft());assert.equal(r.status,201);other=await r.json();assert.notEqual(other.id,first.id);
    const updated=await send(`/api/recipes/${first.id}`,'PUT',recipeDraft({title:"'; DROP TABLE recipes; --",tags:['a,b','a'],ingredients:[{name:' RIZ ',unit:'g',amount:1.375}],steps:[{position:99,kind:'prep',instruction:' Mélanger. ',minutes:0}],sourceUrl:null,photoCopyId:first.id}));
    assert.equal(updated.status,200);const value=await updated.json();assert.equal(value.id,first.id);assert.equal(value.hasPhoto,true);assert.equal(value.sourceUrl,null);
    assert.deepEqual(value.tags,['a','b','a']);assert.deepEqual(value.ingredients,[{name:'riz',unit:'g',amount:1.375,preparation:'unknown'}]);
    assert.deepEqual(value.steps,[{position:1,kind:'prep',instruction:'Mélanger.',minutes:0}]);assert.equal((await read()).length,2);
  });
  await t.test('saisie, JSON, corps trop grand et identifiants non sûrs refusés sans écriture',async()=>{
    const before=await read();
    for(const patch of [{title:'x\0y'},{tags:['a\0b']},{ingredients:[{name:'riz',unit:'g\0',amount:1}]},{ingredients:[{name:'a\0b',unit:'g',amount:1}]},{steps:[{kind:'prep',instruction:'a\0b'}]},
      {minutes:0},{servings:101},{diet:'invalid'},{ingredients:[]},{ingredients:[{name:'riz',unit:'g',amount:-1}]},{steps:[]},{photoCopyId:0},{photo:'bad'},{sourceUrl:'https://user:secret@example.org'}])assert.equal((await send('/api/recipes','POST',recipeDraft(patch))).status,400);
    for(const method of ['PUT','DELETE'])for(const id of ['0','9000000000','9007199254740992','999999999999999999999999'])assert.equal((await send(`/api/recipes/${id}`,method,recipeDraft())).status,400);
    assert.equal((await request('/api/recipes','POST',undefined,cookie,undefined,'{')).status,400);
    assert.equal((await send('/api/recipes','POST',recipeDraft({title:'x'.repeat(600001)}))).status,400);
    assert.deepEqual(await read(),before);
  });
  await t.test('panne d’écriture privée en 503, aucune réussite ni état partiel, reprise',async()=>{
    const before=await read(),undo=failWrite();
    try {const r=await send('/api/recipes','POST',recipeDraft());assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/SELECT|private|password|household\.|23503/i);}
    finally {undo();}
    assert.deepEqual(await read(),before);
  });
  await t.test('planning direct et assiette protègent le retrait, édition actualise le bon titre',async()=>{
    await seedPlanning(first.id,other.id);
    for(const id of [first.id,other.id]){const r=await send(`/api/recipes/${id}`,'DELETE');assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'Cette recette est utilisée dans le planning'});}
    assert.equal((await send(`/api/recipes/${first.id}`,'PUT',recipeDraft({title:'Titre partagé'}))).status,200);assert.equal(await mealTitle(),'Titre partagé');
    assert.equal((await send(`/api/recipes/${other.id}`,'PUT',recipeDraft({title:'Assiette seulement'}))).status,200);assert.equal(await mealTitle(),'Titre partagé');
    await clearPlanning();
  });
  await t.test('zéro et grands IDs numériques éditables, retrait complet sans toucher la connexion',async()=>{
    await seedLegacyIds();
    for(const id of [0,5000000001]){
      const r=await send(`/api/recipes/${id}`,'PUT',recipeDraft());assert.equal(r.status,200);assert.equal((await r.json()).id,id);
    }
    for(const {id} of await read()){const r=await send(`/api/recipes/${id}`,'DELETE');assert.equal(r.status,200);assert.deepEqual(await r.json(),{});}
    assert.deepEqual(await read(),[]);assert.equal((await send('/api/account','GET')).status,200);
  });
}
module.exports={recipeContract};
