const assert=require('node:assert/strict');
const {postgresMeals}=require('../db/meals');
const {lockHousehold}=require('../db/household');
const {mealDraft}=require('./meal-store');

function failingStore(db,needle,at=1){
  let count=0;return postgresMeals({...db,transaction:work=>db.transaction(tx=>work({...tx,query:async(sql,values)=>{
    const result=await tx.query(sql,values);if(sql.startsWith(needle)&&++count===at)await tx.query('SELECT 1/0');return result;
  }}))});
}
async function waitMutation(f,operation,change){
  const client=await f.pool.connect();let pending;
  try {
    await client.query('BEGIN');await lockHousehold(client);pending=Promise.resolve().then(operation);pending.catch(()=>{});
    const end=Date.now()+1800;let waiting=false;
    while(Date.now()<end&&!waiting){waiting=(await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rows[0].n>0;if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));}
    assert.ok(waiting,'La planification doit réellement attendre le verrou du foyer.');await change(client);await client.query('COMMIT');await assert.rejects(pending,{code:'MANGER_MEAL_INPUT'});
  }finally{await client.query('ROLLBACK');client.release();await pending?.catch(()=>{});}
}
async function planningIntegrity(t,{f,store,home,ids}){
  const db=f.database,start='2027-02-01';
  await t.test('rollback natif après lot, remappage, application, restes, déplacement et semaine type',async()=>{
    const templates=await store.templates();await store.removeTemplate(templates.find(r=>r.name==='Plan 0').id);
    const template=(await store.templates()).find(r=>r.name==='Liens zéro'),source=await store.read(start);
    const snapshot=async()=>({weeks:await Promise.all(['2026-12-06',start,'2027-01-25','2027-05-03','2027-05-10','2027-05-17','2027-05-24'].map(date=>store.read(date))),templates:await store.templates()});
    const before=await snapshot(),meals=[mealDraft({date:'2027-05-03',recipeId:ids.base}),mealDraft({date:'2027-05-03',slot:'soir',recipeId:ids.base})];
    await assert.rejects(failingStore(db,'INSERT INTO household.meals',2).planWeek({start:'2027-05-03',meals}),{code:'22012'});
    await assert.rejects(failingStore(db,'UPDATE household.meals SET leftover_of').copyWeek({sourceStart:start,targetStart:'2027-05-10',sourceSnapshot:JSON.stringify(source)}),{code:'22012'});
    await assert.rejects(failingStore(db,'UPDATE household.meals SET leftover_of').applyTemplate(template.id,{targetStart:'2027-05-17'}),{code:'22012'});
    const prepared=(await store.read('2026-12-06')).find(r=>r.date==='2026-12-06');
    await assert.rejects(failingStore(db,'INSERT INTO household.meal_dishes').leftovers({sourceId:prepared.id,date:'2027-05-24',slot:'midi',dishes:[{memberId:ids.vegan,portions:1}]}),{code:'22012'});
    await assert.rejects(failingStore(db,'UPDATE household.meals SET date=').place(0,{action:'move',sourceDate:start,sourceSlot:'midi',date:'2027-01-31',slot:'soir'}),{code:'22012'});
    await assert.rejects(failingStore(db,'INSERT INTO household.week_templates').saveTemplate({name:'Annulé',start}),{code:'22012'});
    await assert.rejects(failingStore(db,'DELETE FROM household.week_templates').removeTemplate(template.id),{code:'22012'});
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('snapshot, régime, occupation et capacité revalidés après attente effective',async()=>{
    await waitMutation(f,()=>store.planWeek({start:'2027-07-05',meals:[mealDraft({date:'2027-07-05',dishes:[{memberId:ids.other,recipeId:ids.rich,portions:1}]})]}),client=>client.query("UPDATE household.members SET diet='vegan' WHERE id=$1",[ids.other]));
    await home.editMember(ids.other,{name:'Admin',diet:'omnivore'});
    const source=await store.read(start);
    await waitMutation(f,()=>store.copyWeek({sourceStart:start,targetStart:'2027-07-05',sourceSnapshot:JSON.stringify(source)}),client=>client.query("UPDATE household.meals SET title='Modifié sous verrou' WHERE id=0"));
    const fresh=await store.read(start);
    await waitMutation(f,()=>store.copyWeek({sourceStart:start,targetStart:'2027-07-05',sourceSnapshot:JSON.stringify(fresh)}),client=>client.query("INSERT INTO household.meals(date,slot,location,occasion,people,title) VALUES('2027-07-05','midi','outside','regular',1,'Occupé sous verrou')"));
    assert.deepEqual((await store.read('2027-07-05')).map(r=>r.title),['Occupé sous verrou']);
    await store.save(mealDraft({date:'2027-12-06',recipeId:ids.base,people:99}));const root=(await store.read('2027-12-06'))[0];
    await waitMutation(f,()=>store.leftovers({sourceId:root.id,date:'2027-12-07',slot:'midi',people:1}),client=>client.query("INSERT INTO household.meals(date,slot,location,occasion,people,title,leftover_of) VALUES('2027-12-08','midi','home','regular',1,'Dernière portion',$1)",[root.id]));
    assert.equal((await store.read(root.date))[0].extraPortions,1);assert.equal((await store.read(root.date)).some(r=>r.date==='2027-12-07'),false);
    await store.save(mealDraft({date:'2028-01-03',recipeId:ids.base}));const movable=(await store.read('2028-01-03'))[0];
    await waitMutation(f,()=>store.place(movable.id,{action:'move',sourceDate:movable.date,sourceSlot:movable.slot,date:'2028-01-05',slot:'soir'}),client=>client.query("INSERT INTO household.meals(date,slot,location,occasion,people,title,leftover_of) VALUES('2028-01-04','midi','home','regular',1,'Reste lié sous verrou',$1)",[movable.id]));
    assert.equal((await store.read(movable.date))[0].id,movable.id);
  });
  await t.test('lecture extérieure pendant copie et deux lots concurrents : aucune vue ou copie partielle',async()=>{
    let ready,release;const entered=new Promise(resolve=>{ready=resolve;}),gate=new Promise(resolve=>{release=resolve;});let paused=false;
    const slow=postgresMeals({...db,transaction:work=>db.transaction(tx=>work({...tx,query:async(sql,values)=>{const result=await tx.query(sql,values);if(!paused&&sql.startsWith('INSERT INTO household.meals')){paused=true;ready();await gate;}return result;}}))});
    const source=await store.read(start),input={sourceStart:start,targetStart:'2027-08-02',sourceSnapshot:JSON.stringify(source)},pending=slow.copyWeek(input);pending.catch(()=>{});
    try {await Promise.race([entered,pending]);assert.deepEqual(await store.read(input.targetStart),[]);}finally{release();await pending;}
    const copied=await store.read(input.targetStart);assert.equal(copied.length,2);assert.equal(copied[1].leftoverOf,copied[0].id);
    const a=[mealDraft({date:'2027-09-06',recipeId:ids.base,title:'A1'}),mealDraft({date:'2027-09-06',slot:'soir',recipeId:ids.base,title:'A2'})],b=a.map(m=>({...m,title:m.title.replace('A','B')}));
    const plans=await Promise.allSettled([store.planWeek({start:'2027-09-06',meals:a}),store.planWeek({start:'2027-09-06',meals:b})]);assert.equal(plans.filter(r=>r.status==='fulfilled').length,1);
    const titles=(await store.read('2027-09-06')).map(r=>r.title);assert.ok(JSON.stringify(titles)==='["A1","A2"]'||JSON.stringify(titles)==='["B1","B2"]');
    const copies=await Promise.allSettled([store.copyWeek({...input,targetStart:'2027-10-04'}),store.copyWeek({...input,targetStart:'2027-10-04'})]);assert.equal(copies.filter(r=>r.status==='fulfilled').length,1);assert.equal((await store.read('2027-10-04')).length,2);
  });
}
module.exports={planningIntegrity};
