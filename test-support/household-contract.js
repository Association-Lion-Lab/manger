const assert=require('node:assert/strict');

async function householdContract(t,{request,login,failRead,seedLargeIds}) {
  let cookie,member,protein;
  const send=(path,method='GET',data)=>request(path,method,data,cookie);
  const home=async()=>{const r=await send('/api/household');assert.equal(r.status,200);return r.json();};
  await t.test('authentification et origine requises, pas de privilège administrateur pour le foyer',async()=>{
    for(const [path,method,data] of [['/api/household','GET'],['/api/members','POST',{}],['/api/proteins/1','DELETE']])assert.equal((await request(path,method,data)).status,401);
    cookie=await login('member');
    assert.equal((await request('/api/members','POST',{},cookie,'https://untrusted.invalid')).status,403);
    assert.deepEqual(await home(),{avoidedIngredients:[],members:[],proteins:[]});
  });
  await t.test('personnes : normalisation, goûts omis/préservés/effacés et doublons lisibles',async()=>{
    let r=await send('/api/members','POST',{name:' Member ',diet:'vegetarian'});assert.equal(r.status,201);
    member=await r.json();assert.deepEqual(member,{id:member.id,name:'Member',diet:'vegetarian'});assert.ok(Number.isSafeInteger(member.id));
    assert.deepEqual((await home()).members,[{...member,avoidedIngredients:[]}]);
    r=await send('/api/members','POST',{name:'Member',diet:'vegan'});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'Ce membre existe déjà'});
    r=await send('/api/members','POST',{name:'member',diet:'omnivore'});assert.equal(r.status,201);const other=await r.json();
    assert.equal((await send(`/api/members/${other.id}`,'PUT',{name:'Member',diet:'vegan'})).status,400);
    assert.equal((await send(`/api/members/${member.id}`,'PUT',{name:'Member',diet:'vegetarian',avoidedIngredients:[' TOMATE crue ','tomate crue','tomate cuite','nul\0json']})).status,200);
    r=await send(`/api/members/${member.id}`,'PUT',{name:'Member',diet:'vegetarian'});assert.deepEqual(await r.json(),member);
    assert.deepEqual((await home()).members[0].avoidedIngredients,['tomate crue','tomate cuite','nul\0json']);
    assert.equal((await send(`/api/members/${member.id}`,'PUT',{...member,avoidedIngredients:[]})).status,200);
    assert.deepEqual((await home()).members[0].avoidedIngredients,[]);
    assert.equal((await send(`/api/members/${other.id}`,'DELETE')).status,200);
  });
  await t.test('préférences globales : normalisation, remplacement entier et refus sans modification',async()=>{
    const r=await send('/api/household/preferences','PUT',{avoidedIngredients:[' ŒUF ','œuf','tomate crue']});assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{avoidedIngredients:['œuf','tomate crue']});
    const before=await home();assert.deepEqual(before.avoidedIngredients,['tomate crue','œuf']);
    for(const names of [null,[''],[22],Array(51).fill('riz'),['bad\0text']])assert.equal((await send('/api/household/preferences','PUT',{avoidedIngredients:names})).status,400);
    assert.deepEqual(await home(),before);
    assert.equal((await send('/api/household/preferences','PUT',{avoidedIngredients:[]})).status,200);
    assert.deepEqual((await home()).avoidedIngredients,[]);
  });
  await t.test('protéines : précision, normalisation et collisions en création/édition',async()=>{
    let r=await send('/api/proteins','POST',{name:' TOfu ',category:'plant',amount:125.375,unit:' g '});assert.equal(r.status,201);protein=await r.json();
    assert.deepEqual(protein,{id:protein.id,name:'tofu',category:'plant',amount:125.375,unit:'g'});
    r=await send('/api/proteins','POST',{...protein,name:'TOFU'});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'Cette protéine existe déjà'});
    r=await send('/api/proteins','POST',{...protein,name:'tempeh'});const other=await r.json();assert.equal(r.status,201);
    assert.equal((await send(`/api/proteins/${other.id}`,'PUT',{...protein,name:'Tofu'})).status,400);
    assert.equal((await send(`/api/proteins/${other.id}`,'DELETE')).status,200);
    assert.deepEqual((await home()).proteins,[protein]);
  });
  await t.test('saisie, JSON, taille, IDs invalides et éléments inconnus refusés',async()=>{
    const before=await home();
    for(const value of [null,{}, {...member,diet:'invalid'}, {...member,name:'bad\0name'}, {...member,avoidedIngredients:null}])assert.equal((await send('/api/members','POST',value)).status,400);
    for(const value of [{...protein,unit:'g\0'}, {...protein,name:'bad\0name'}, {...protein,amount:0}, {...protein,amount:10001}])assert.equal((await send('/api/proteins','POST',value)).status,400);
    for(const [collection,value] of [['members',member],['proteins',protein]])for(const method of ['PUT','DELETE']) {
      for(const id of ['0','9007199254740992','999999999999999999999999999999'])assert.equal((await send(`/api/${collection}/${id}`,method,value)).status,400);
      assert.equal((await send(`/api/${collection}/9000000000`,method,value)).status,400);
    }
    const badJson=await request('/api/members','POST',undefined,cookie,undefined,'{');assert.equal(badJson.status,400);
    const big=await send('/api/members','POST',{...member,name:'x'.repeat(33000)});assert.equal(big.status,400);
    assert.deepEqual(await home(),before);
  });
  await t.test('échec interne privé : 503 sans SQL, puis reprise',async()=>{
    const undo=failRead();
    try {const r=await send('/api/household');assert.equal(r.status,503);const body=await r.text();assert.ok(!/SELECT|private|password|household\./i.test(body));}
    finally {undo();}
    assert.equal((await send('/api/household')).status,200);
  });
  await t.test('IDs sûrs au-delà de 32 bits toujours numériques, retrait et compte séparés',async()=>{
    await seedLargeIds();const state=await home();assert.equal(state.members.find(m=>m.name==='Large').id,5000000001);assert.equal(state.proteins.find(p=>p.name==='large').id,5000000002);
    for(const [collection,id] of [['members',5000000001],['proteins',5000000002],['members',member.id],['proteins',protein.id]])assert.deepEqual(await (await send(`/api/${collection}/${id}`,'DELETE')).json(),{});
    assert.deepEqual(await home(),{avoidedIngredients:[],members:[],proteins:[]});
    assert.equal((await send('/api/account')).status,200);
  });
}
module.exports={householdContract};
