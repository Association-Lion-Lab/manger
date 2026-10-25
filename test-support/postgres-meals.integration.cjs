const test=require('node:test');
const assert=require('node:assert/strict');
const {databaseFixture}=require('./database');
const {postgresMeals}=require('../db/meals');
const {postgresHousehold,lockHousehold}=require('../db/household');
const {postgresRecipes}=require('../db/recipes');
const {mealStoreContract,mealDraft,plain}=require('./meal-store');
const {recipeDraft}=require('./recipe-fixture');
const {validateRecipe}=require('../recipe');
test('contrat repas PostgreSQL réel',{timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database;
  const store=postgresMeals(db),home=postgresHousehold(db),recipes=postgresRecipes(db);
  const ids=await mealStoreContract(t,{store,home,recipes,
    linkRest:(id,date,people)=>db.query("INSERT INTO household.meals(date,slot,location,occasion,people,title,leftover_of) VALUES($1,'midi','home','regular',$2,'Restes',$3)",[date,people,id])});
  await t.test('erreur après enfants ou retrait réel : rollback complet et reprise',async()=>{
    const draft=mealDraft({date:'2026-10-29',dishes:[{memberId:ids.other,recipeId:ids.rich,portions:1}]});await store.save(draft);
    const before=await store.read('2026-10-26');
    const broken=needle=>postgresMeals({...db,transaction:work=>db.transaction(tx=>work({...tx,query:async(sql,values)=>{const result=await tx.query(sql,values);if(sql.startsWith(needle))await tx.query('SELECT 1/0');return result;}}))});
    for(const date of [draft.date,'2026-10-27'])await assert.rejects(async()=>broken('INSERT INTO household.meal_dishes').save({...draft,date,title:'Échec'}),{code:'22012'});
    assert.deepEqual(await store.read('2026-10-26'),before);
    await assert.rejects(broken('DELETE FROM household.meals WHERE').remove(draft.date,draft.slot),{code:'22012'});assert.deepEqual(await store.read('2026-10-26'),before);
    await store.save({...draft,title:'Reprise'});assert.equal((await store.read('2026-10-26')).find(r=>r.date===draft.date).title,'Reprise');
  });
  async function afterLock(operation,change,error) {
    const client=await f.pool.connect();let pending;
    try {
      await client.query('BEGIN');await lockHousehold(client);pending=Promise.resolve().then(operation);pending.catch(()=>{});
      const until=Date.now()+1800;let waiting=false;
      while(Date.now()<until&&!waiting){waiting=(await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rows[0].n>0;if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));}
      assert.ok(waiting,'Le repas doit réellement attendre le verrou du foyer.');await change(client);await client.query('COMMIT');await assert.rejects(pending,error);
    } finally {await client.query('ROLLBACK');client.release();await pending?.catch(()=>{});}
  }
  await t.test('régime et protéine revalidés après attente réelle du verrou',async()=>{
    await home.editMember(ids.vegan,{name:'Vegan',diet:'omnivore'});
    await afterLock(()=>store.save(mealDraft({date:'2026-10-27',dishes:[{memberId:ids.vegan,recipeId:ids.rich,portions:1}]})),client=>client.query("UPDATE household.members SET diet='vegan' WHERE id=$1",[ids.vegan]),{code:'MANGER_MEAL_INPUT'});
    await afterLock(()=>store.save(mealDraft({date:'2026-10-27',dishes:[{memberId:ids.vegan,recipeId:ids.base,proteinId:ids.plant,portions:1}]})),client=>client.query("UPDATE household.proteins SET category='meat' WHERE id=$1",[ids.plant]),{code:'MANGER_MEAL_INPUT'});
    assert.equal((await store.read('2026-10-26')).some(r=>r.date==='2026-10-27'),false);
  });
  await t.test('recette supprimée et créneau occupé pendant attente : aucun ajout ni écrasement',async()=>{
    const recipe=await recipes.save(validateRecipe({...recipeDraft(),title:'Référence temporaire'}));
    await afterLock(()=>store.save(mealDraft({date:'2026-10-27',recipeId:recipe.id})),client=>client.query('DELETE FROM household.recipes WHERE id=$1',[recipe.id]),{code:'MANGER_MEAL_INPUT'});
    await afterLock(()=>store.save(mealDraft({date:'2026-10-27'}),null),client=>client.query("INSERT INTO household.meals(date,slot,location,occasion,people,title) VALUES('2026-10-27','midi','outside','regular',1,'Concurrent')"),{code:'MANGER_MEAL_INPUT',status:409});
    assert.equal((await store.read('2026-10-26')).find(r=>r.date==='2026-10-27').title,'Concurrent');
  });
  await t.test('restes liés pendant attente protègent remplacement et retrait de la source',async()=>{
    const source=(await store.read('2026-10-26')).find(r=>r.date==='2026-10-29');
    await afterLock(()=>store.save(mealDraft({date:source.date})),client=>client.query("INSERT INTO household.meals(date,slot,location,occasion,people,title,leftover_of) VALUES('2026-11-15','midi','home','regular',1,'Restes',$1)",[source.id]),{code:'MANGER_MEAL_INPUT'});
    await assert.rejects(store.remove(source.date,source.slot),{code:'MANGER_MEAL_INPUT'});
    await store.remove('2026-11-15','midi');
  });
  await t.test('lecture pendant édition voit un repas entier ; deux remplacements ne mélangent pas les assiettes',async()=>{
    const before=await store.read('2026-10-26'),source=before.find(r=>r.date==='2026-10-29'),client=await f.pool.connect();
    try {await client.query('BEGIN');await lockHousehold(client);await client.query('DELETE FROM household.meal_dishes WHERE meal_id=$1',[source.id]);await client.query("UPDATE household.meals SET title='Non engagé' WHERE id=$1",[source.id]);assert.deepEqual(await store.read('2026-10-26'),before);}
    finally {await client.query('ROLLBACK');client.release();}
    const a=mealDraft({date:source.date,title:'A',dishes:[{memberId:ids.other,recipeId:ids.rich,portions:3}]}),b=mealDraft({date:source.date,title:'B',dishes:[{memberId:ids.other,recipeId:ids.base,portions:2}]});
    await Promise.all([store.save(a),store.save(b)]);const final=(await store.read('2026-10-26')).find(r=>r.id===source.id),expected=final.title==='A'?a:b;
    assert.deepEqual(plain(final.dishes),expected.dishes);assert.equal(final.people,expected.dishes[0].portions);
  });
});
