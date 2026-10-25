const assert=require('node:assert/strict');
const {mealDraft,seedMeals,plain}=require('./meal-store');
async function planningHttpContract(t,{request,login,store,home,recipes,failDatabase,seedTemplateIds}) {
  const ids=await seedMeals(home,recipes),start='2026-11-02';let cookie,root,template;
  const post=(path,value)=>request(path,'POST',value,cookie);
  await t.test('authentification et origine requises pour chaque nouveau parcours',async()=>{
    for(const [path,method] of [['/api/week/plan','POST'],['/api/week/copy','POST'],['/api/meals/0/placement','POST'],['/api/meals/leftovers','POST'],['/api/week-templates','GET'],['/api/week-templates','POST'],['/api/week-templates/0','DELETE'],['/api/week-templates/0/apply','POST']])assert.equal((await request(path,method,method==='POST'?{}:undefined)).status,401);
    cookie=await login();assert.equal((await request('/api/week/plan','POST',{},cookie,'https://evil.example')).status,403);
  });
  await t.test('menu, restes et copie : mêmes statuts, liens locaux et conflit sans écrasement',async()=>{
    const meals=[mealDraft({date:start,recipeId:ids.base}),mealDraft({date:start,slot:'soir',dishes:[{memberId:ids.other,recipeId:ids.rich,portions:1}]})];
    let response=await post('/api/week/plan',{start,meals});assert.equal(response.status,200);assert.deepEqual(await response.json(),{added:2});root=(await store.read(start))[0];
    response=await post('/api/meals/leftovers',{sourceId:root.id,date:'2026-11-03',slot:'midi',people:2});assert.equal(response.status,201);assert.deepEqual(await response.json(),{});
    const source=plain(await store.read(start)),input={sourceStart:start,targetStart:'2026-11-09',sourceSnapshot:JSON.stringify(source)};
    response=await post('/api/week/copy',input);assert.equal(response.status,200);assert.deepEqual(await response.json(),{added:3});const copy=await store.read(input.targetStart);assert.equal(copy[2].leftoverOf,copy[0].id);assert.notEqual(copy[2].leftoverOf,root.id);
    assert.equal((await post('/api/week/copy',input)).status,400);assert.equal((await store.read(input.targetStart)).length,3);
    assert.equal((await post('/api/week/copy',{...input,targetStart:'2026-11-16',sourceSnapshot:'[]'})).status,400);assert.equal((await store.read('2026-11-16')).length,0);
  });
  await t.test('déplacements et semaines types, validation et taille de requête',async()=>{
    const input={action:'copy',date:'2026-11-04',slot:'soir',sourceDate:root.date,sourceSlot:root.slot};assert.equal((await post(`/api/meals/${root.id}/placement`,input)).status,200);assert.equal((await post(`/api/meals/${root.id}/placement`,input)).status,400);
    assert.equal((await post(`/api/meals/${root.id}/placement`,{...input,action:'move',date:'2026-11-05'})).status,400);
    let response=await post('/api/week-templates',{name:' Exemple ',start});assert.equal(response.status,201);template=await response.json();assert.equal(template.name,'Exemple');assert.equal(template.mealCount,4);
    assert.equal((await post('/api/week-templates',{name:'Exemple',start})).status,400);const list=await (await request('/api/week-templates','GET',undefined,cookie)).json();assert.equal(list[0].id,template.id);assert.equal(typeof list[0].createdAt,'string');
    response=await post(`/api/week-templates/${template.id}/apply`,{targetStart:'2026-11-23'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{added:4});
    for(const [path,value] of [['/api/week/plan',{}],['/api/week/copy',{}],['/api/week-templates',{name:'x\0y',start}],['/api/meals/leftovers',{sourceId:'1'}]])assert.equal((await post(path,value)).status,400);
    assert.equal((await post('/api/meals/9007199254740992/placement',input)).status,400);assert.equal((await request('/api/week-templates/9007199254740992','DELETE',undefined,cookie)).status,400);
    assert.equal((await request('/api/week/plan','POST',undefined,cookie,undefined,'{')).status,400);assert.equal((await request('/api/week/plan','POST',undefined,cookie,undefined,' '.repeat(32769))).status,400);
  });
  await t.test('pannes SQL privées, aucun lot ajouté, puis reprise volontaire',async()=>{
    const before=plain(await store.read(start)),restore=failDatabase();
    try {
      const routes=[['/api/week-templates','GET'],['/api/week-templates','POST',{name:'Panne',start}],['/api/week/plan','POST',{start,meals:[]}],['/api/week/copy','POST',{sourceStart:start,targetStart:'2026-12-07'}],[`/api/week-templates/${template.id}/apply`,'POST',{targetStart:'2026-12-07'}],[`/api/week-templates/${template.id}`,'DELETE'],[`/api/meals/${root.id}/placement`,'POST',{action:'copy',date:'2026-12-07',slot:'soir',sourceDate:start,sourceSlot:'midi'}],['/api/meals/leftovers','POST',{sourceId:root.id,date:'2026-12-07',slot:'midi',people:1}]];
      for(const [path,method,value] of routes){const response=await request(path,method,value,cookie);assert.equal(response.status,503,path);assert.doesNotMatch(await response.text(),/SELECT|private|password|household\./i);}
    }finally{restore();}
    assert.deepEqual(plain(await store.read(start)),before);assert.equal((await request('/api/week-templates','GET',undefined,cookie)).status,200);
  });
  await t.test('semaines types ID zéro et grands IDs appliqués et retirés sans troncature',async()=>{
    await seedTemplateIds(JSON.stringify(await store.read(start)),start);
    for(const [id,targetStart] of [[0,'2027-06-07'],[5000000001,'2027-06-14']]){
      assert.equal((await post(`/api/week-templates/${id}/apply`,{targetStart})).status,200);assert.equal((await store.read(targetStart)).length,4);
      assert.deepEqual(await (await request(`/api/week-templates/${id}`,'DELETE',undefined,cookie)).json(),{ok:true});assert.equal((await request(`/api/week-templates/${id}`,'DELETE',undefined,cookie)).status,400);
    }
  });
}
module.exports={planningHttpContract};
