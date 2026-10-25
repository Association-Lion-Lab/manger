const assert=require('node:assert/strict');
const {mealDraft,seedMeals,plain}=require('./meal-store');
async function weekStoreContract(t,{store,home,recipes}) {
  const ids=await seedMeals(home,recipes),start='2026-11-02',target='2026-11-09';
  await t.test('composition entière, régimes du foyer, créneaux et références',async()=>{
    const list=[mealDraft({date:start,recipeId:ids.base}),mealDraft({date:start,slot:'soir',dishes:[{memberId:ids.other,recipeId:ids.rich,proteinId:ids.meat,portions:2}]})];
    assert.equal(await store.planWeek({start,meals:list}),2);const before=plain(await store.read(start));
    for(const meals of [[list[0]], [{...list[0],date:target}],[{...list[0],date:'2026-11-03',recipeId:ids.rich}],[{...list[0],date:'2026-11-03',recipeId:99999}],[{...list[0],date:'2026-11-03'},{...list[0],date:'2026-11-03'}]])await assert.rejects(async()=>store.planWeek({start,meals}),{code:'MANGER_MEAL_INPUT'});
    assert.deepEqual(plain(await store.read(start)),before);
  });
  await t.test('copie sans écrasement, snapshot exact et aucune copie partielle',async()=>{
    const source=plain(await store.read(start)),input={sourceStart:start,targetStart:target,sourceSnapshot:JSON.stringify(source)};
    assert.equal(await store.copyWeek(input),2);let copied=plain(await store.read(target));assert.equal(copied.length,2);
    assert.deepEqual(copied[1].dishes,source[1].dishes);assert.notEqual(copied[0].id,source[0].id);assert.deepEqual(plain(await store.read(start)),source);
    for(const change of [{},{targetStart:start},{targetStart:'2026-11-10'},{targetStart:'2026-11-16',sourceSnapshot:'[]'}])await assert.rejects(async()=>store.copyWeek({...input,...change}),{code:'MANGER_MEAL_INPUT'});
    await store.save(mealDraft({date:'2026-11-16',slot:'soir',title:'Occupé'}));
    await assert.rejects(async()=>store.copyWeek({...input,targetStart:'2026-11-16'}),{code:'MANGER_MEAL_INPUT'});copied=await store.read('2026-11-16');assert.equal(copied.length,1);assert.equal(copied[0].title,'Occupé');
  });
  await t.test('semaines types figées, unicité sensible à la casse et application après retrait source',async()=>{
    assert.deepEqual(await store.templates(),[]);
    const first=await store.saveTemplate({name:' Base ',start});assert.equal(first.name,'Base');assert.equal(first.mealCount,2);assert.equal(typeof first.id,'number');
    await assert.rejects(async()=>store.saveTemplate({name:'Base',start}),{code:'MANGER_MEAL_INPUT'});
    const second=await store.saveTemplate({name:'base',start});const list=await store.templates();assert.deepEqual(list.map(row=>row.name),['Base','base']);assert.ok(list.every(row=>typeof row.createdAt==='string'&&row.mealCount===2));
    await store.remove(start,'midi');await store.remove(start,'soir');
    assert.equal(await store.applyTemplate(first.id,{targetStart:'2026-11-23'}),2);assert.equal((await store.read('2026-11-23'))[0].title,'Repas');
    await assert.rejects(async()=>store.applyTemplate(first.id,{targetStart:'2026-11-23'}),{code:'MANGER_MEAL_INPUT'});
    await store.removeTemplate(second.id);await assert.rejects(async()=>store.removeTemplate(second.id),{code:'MANGER_MEAL_INPUT'});
    for(const name of ['', 'x'.repeat(61),'bad\0name'])await assert.rejects(async()=>store.saveTemplate({name,start:'2026-11-23'}),{code:'MANGER_MEAL_INPUT'});
  });
  await t.test('quota de trente semaines types vérifié atomiquement',async()=>{
    for(let i=0;i<28;i++)await store.saveTemplate({name:'Plan '+i,start:target});
    const results=await Promise.allSettled(['Concurrent A','Concurrent B'].map(name=>Promise.resolve().then(()=>store.saveTemplate({name,start:target}))));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'MANGER_MEAL_INPUT');assert.equal((await store.templates()).length,30);
  });
  return ids;
}
async function placementStoreContract(t,{store,home,ids,seedZeroSource}) {
  const {vegan,other,plant,meat,base,rich}=ids,start='2026-12-07';let source;
  await t.test('copie individuelle conserve les suppléments, source et destination contrôlées',async()=>{
    const original=mealDraft({date:start,recipeId:base,assignments:[{memberId:vegan,proteinId:plant,portions:1},{memberId:other,proteinId:meat,portions:2}]});
    await store.save(original);source=(await store.read(start))[0];
    const input={action:'copy',sourceDate:start,sourceSlot:'midi',date:'2026-12-08',slot:'soir'};
    assert.equal(await store.place(source.id,input),true);const copy=(await store.read(start)).find(r=>r.date===input.date);assert.deepEqual(copy.assignments,source.assignments);assert.notEqual(copy.id,source.id);
    for(const change of [{},{sourceDate:'2026-12-06',date:'2026-12-09'}])await assert.rejects(async()=>store.place(source.id,{...input,...change}),{code:'MANGER_MEAL_INPUT'});
  });
  await t.test('restes choisis depuis la source, sans accepter les substitutions du corps reçu',async()=>{
    await store.leftovers({sourceId:source.id,date:'2026-12-09',slot:'midi',dishes:[{memberId:vegan,portions:2,recipeId:rich,proteinId:meat}]});
    const rest=(await store.read(start)).find(r=>r.leftoverOf===source.id);assert.equal(rest.recipeId,null);assert.equal(rest.people,2);assert.deepEqual(rest.dishes,[{memberId:vegan,recipeId:base,proteinId:plant,portions:2}]);
    assert.equal((await store.read(start)).find(r=>r.id===source.id).extraPortions,2);
    for(const dishes of [[],[{memberId:vegan,portions:0}],[{memberId:vegan,portions:1},{memberId:vegan,portions:1}],[{memberId:99999,portions:1}]])await assert.rejects(async()=>store.leftovers({sourceId:source.id,date:'2026-12-10',slot:'midi',dishes}),{code:'MANGER_MEAL_INPUT'});
    await home.editMember(other,{name:'Admin',diet:'vegan'});
    await store.leftovers({sourceId:source.id,date:'2026-12-10',slot:'soir',dishes:[{memberId:other,portions:1}]});
    assert.equal((await store.read(start)).find(r=>r.date==='2026-12-10').dishes[0].proteinId,meat);
    await home.editMember(other,{name:'Admin',diet:'omnivore'});
  });
  await t.test('déplacement garde les IDs/liens et la chronologie ; un reste ne se recopie pas seul',async()=>{
    const rest=(await store.read(start)).find(r=>r.date==='2026-12-09');
    await assert.rejects(async()=>store.place(source.id,{action:'move',sourceDate:start,sourceSlot:'midi',date:'2026-12-11',slot:'soir'}),{code:'MANGER_MEAL_INPUT'});
    await assert.rejects(async()=>store.place(rest.id,{action:'move',sourceDate:rest.date,sourceSlot:rest.slot,date:start,slot:'midi'}),{code:'MANGER_MEAL_INPUT'});
    await assert.rejects(async()=>store.place(rest.id,{action:'copy',sourceDate:rest.date,sourceSlot:rest.slot,date:'2026-12-11',slot:'soir'}),{code:'MANGER_MEAL_INPUT'});
    await assert.rejects(async()=>store.leftovers({sourceId:rest.id,date:'2026-12-11',slot:'soir',people:1}),{code:'MANGER_MEAL_INPUT'});
    await store.place(source.id,{action:'move',sourceDate:start,sourceSlot:'midi',date:'2026-12-06',slot:'soir'});
    assert.equal((await store.read('2026-12-06')).find(r=>r.id===rest.id).leftoverOf,source.id);
  });
  await t.test('copie et semaine type remappent les liens avec une source ID zéro',async()=>{
    const date='2027-02-01';await seedZeroSource(base);
    await store.leftovers({sourceId:0,date:'2027-02-02',slot:'midi',people:2});
    const sourceRows=plain(await store.read(date));assert.equal(sourceRows[0].id,0);assert.equal(sourceRows[1].leftoverOf,0);
    await store.copyWeek({sourceStart:date,targetStart:'2027-02-08',sourceSnapshot:JSON.stringify(sourceRows)});
    const rows=await store.read('2027-02-08');assert.equal(rows[1].leftoverOf,rows[0].id);assert.notEqual(rows[1].leftoverOf,0);assert.equal(rows[0].extraPortions,2);
    const existing=await store.templates();await store.removeTemplate(existing[0].id);
    const template=await store.saveTemplate({name:'Liens zéro',start:date});await store.applyTemplate(template.id,{targetStart:'2027-02-15'});
    const applied=await store.read('2027-02-15');assert.equal(applied[1].leftoverOf,applied[0].id);
  });
  await t.test('capacité des restes atomique, toutes semaines confondues et source sans recette refusée',async()=>{
    const date='2027-03-01';await store.save(mealDraft({date,recipeId:base,people:98}));const root=(await store.read(date))[0];
    const results=await Promise.allSettled(['2027-03-09','2027-03-10'].map(date=>Promise.resolve().then(()=>store.leftovers({sourceId:root.id,date,slot:'midi',people:2}))));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await store.read(date))[0].extraPortions,2);
    const external=plain(await store.read('2027-03-08'));await assert.rejects(async()=>store.copyWeek({sourceStart:'2027-03-08',targetStart:'2027-03-15',sourceSnapshot:JSON.stringify(external)}),{code:'MANGER_MEAL_INPUT'});
    await store.save(mealDraft({date:'2027-04-05',assignments:[{memberId:vegan,proteinId:plant,portions:1}]}));const proteinOnly=(await store.read('2027-04-05'))[0];
    await assert.rejects(async()=>store.leftovers({sourceId:proteinOnly.id,date:'2027-04-06',slot:'midi',dishes:[{memberId:vegan,portions:1}]}),{code:'MANGER_MEAL_INPUT'});
  });
}
module.exports={weekStoreContract,placementStoreContract};
