const assert=require('node:assert/strict');
const {mealDraft,seedMeals,plain}=require('./meal-store');
async function mealHttpContract(t,{request,login,store,home,recipes,failDatabase,seedLegacyIds}) {
  const {other,vegan,base,rich,meat}=await seedMeals(home,recipes);let cookie;
  const send=input=>request('/api/meals','POST',input,cookie);
  await t.test('compte et origine requis, y compris téléchargement calendrier',async()=>{
    for(const [path,method] of [['/api/meals','POST'],['/api/meals?date=2026-10-26&slot=midi','DELETE'],['/api/calendar.ics?start=2026-10-26','GET']])assert.equal((await request(path,method,method==='POST'?mealDraft():undefined)).status,401);
    cookie=await login();assert.equal((await request('/api/meals','POST',mealDraft(),cookie,'https://evil.example')).status,403);
    assert.deepEqual(await store.read('2026-10-26'),[]);
  });
  await t.test('ajout protégé, remplacement explicite, retrait et conflit sans écriture',async()=>{
    const draft=mealDraft({recipeId:base,expectedId:null});let response=await send(draft);assert.equal(response.status,200);
    const body=await response.json();assert.equal(body.title,'Repas');assert.equal('expectedId' in body,false);
    const [current]=await store.read(draft.date);assert.equal(typeof current.id,'number');
    const before=plain(await store.read(draft.date));assert.equal((await send({...draft,title:'Ne doit pas écraser'})).status,409);assert.deepEqual(plain(await store.read(draft.date)),before);
    assert.equal((await send({...draft,title:'Remplacement',expectedId:current.id})).status,200);
    assert.equal((await request(`/api/meals?date=${draft.date}&slot=midi&expectedId=null`,'DELETE',undefined,cookie)).status,409);
    assert.equal((await request(`/api/meals?date=${draft.date}&slot=midi&expectedId=${current.id}`,'DELETE',undefined,cookie)).status,200);
    assert.equal((await request(`/api/meals?date=${draft.date}&slot=midi`,'DELETE',undefined,cookie)).status,200);
    assert.equal((await send({...draft,expectedId:current.id})).status,409);
    assert.equal((await send(mealDraft())).status,200);assert.equal((await send(mealDraft({title:'Ancien contrat'}))).status,200);
  });
  await t.test('assiettes, portions et protéines facultatives, validation et corps borné',async()=>{
    const dishes=[{memberId:vegan,recipeId:base,portions:2},{memberId:other,recipeId:rich,portions:1,proteinId:meat}];
    assert.equal((await send(mealDraft({dishes}))).status,200);const [row]=await store.read('2026-10-26');assert.equal(row.people,3);assert.equal(row.minutes,35);assert.deepEqual(row.dishes,dishes);
    for(const change of [{title:'x\0y'},{people:0},{recipeId:'1'},{expectedId:'1'},{expectedId:9007199254740992},{dishes:[{...dishes[0],proteinId:meat}]}])assert.equal((await send(mealDraft(change))).status,400);
    for(const query of ['date=no&slot=midi','date=2026-10-26&slot=no','date=2026-10-26&slot=midi&expectedId=bad'])assert.equal((await request('/api/meals?'+query,'DELETE',undefined,cookie)).status,400);
    assert.equal((await request('/api/meals','POST',undefined,cookie,undefined,'{')).status,400);
    assert.equal((await request('/api/meals','POST',undefined,cookie,undefined,' '.repeat(32769))).status,400);
  });
  await t.test('ICS privé, journées entières, frontière d’année, Unicode et téléchargement Safari',async()=>{
    await send(mealDraft({date:'2026-12-31',slot:'soir',location:'restaurant',occasion:'date',title:'Dîner, riz; œuf\\plat\nsuite'}));
    for(const suffix of ['', '&download=1']) {
      const response=await request('/api/calendar.ics?start=2026-12-28'+suffix,'GET',undefined,cookie);assert.equal(response.status,200);
      assert.equal(response.headers.get('content-type'),suffix?'application/octet-stream':'text/calendar; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'),'attachment; filename="manger-2026-12-28.ics"');assert.equal(response.headers.get('cache-control'),'no-store');
      const body=Buffer.from(await response.arrayBuffer());assert.equal(body.length,Number(response.headers.get('content-length')));
      assert.match(body.toString(),/DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);assert.match(body.toString(),/SUMMARY:Soir — Dîner\\, riz\\; œuf\\\\plat\\nsuite\r\n/);
      assert.match(body.toString(),/DESCRIPTION:Restaurant · 2 personnes/);assert.equal(body.toString().replaceAll('\r\n','').includes('\n'),false);
    }
    assert.equal((await request('/api/calendar.ics?start=bad','GET',undefined,cookie)).status,400);
  });
  await t.test('panne SQL privée, aucune réussite ni fichier annoncé, reprise volontaire',async()=>{
    const before=plain(await store.read('2026-10-26')),restore=failDatabase();
    try {
      for(const [path,method,input] of [['/api/meals','POST',mealDraft()],['/api/meals?date=2026-10-26&slot=midi','DELETE'],['/api/calendar.ics?start=2026-10-26','GET']]){
        const response=await request(path,method,input,cookie);assert.equal(response.status,503);assert.equal(response.headers.has('content-disposition'),false);assert.doesNotMatch(await response.text(),/SELECT|private|password|household\./i);
      }
    } finally {restore();}
    assert.deepEqual(plain(await store.read('2026-10-26')),before);assert.equal((await send(mealDraft({title:'Reprise'}))).status,200);
  });
  await t.test('IDs zéro et supérieurs à 32 bits gardés numériques pour repas et références',async()=>{
    await seedLegacyIds();
    for(const id of [0,5000000001]){
      const date=id===0?'2026-11-09':'2026-11-10';const input=mealDraft({date,dishes:[{memberId:id,recipeId:id,proteinId:id,portions:1}]});
      assert.equal((await send({...input,expectedId:id})).status,200);
      const row=(await store.read('2026-11-09')).find(r=>r.id===id);assert.ok(row);assert.equal(row.dishes[0].proteinId,id);
      assert.equal((await request(`/api/meals?date=${date}&slot=midi&expectedId=${id}`,'DELETE',undefined,cookie)).status,200);
    }
  });
}
module.exports={mealHttpContract};
