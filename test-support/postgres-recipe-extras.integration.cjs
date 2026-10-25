const test=require('node:test');
const assert=require('node:assert/strict');
const {databaseFixture}=require('./database');
const {postgresRecipes}=require('../db/recipes');
const {extrasStoreContract}=require('./recipe-extras-store');
const {validateRecipe}=require('../recipe');
const {recipeDraft}=require('./recipe-fixture');
const {lockHousehold}=require('../db/household');

test('photos, favoris et avis PostgreSQL réels',{timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,store=postgresRecipes(db);
  await extrasStoreContract(t,{store,
    counts:async id=>(await db.query('SELECT (SELECT count(*)::int FROM household.recipe_favorites WHERE recipe_id=$1) AS favorites,(SELECT count(*)::int FROM household.recipe_notes WHERE recipe_id=$1) AS notes',[id])).rows[0],
    seedZero:()=>db.query("INSERT INTO household.recipes(id,title,minutes,servings,diet) VALUES(0,'Zero',1,1,'vegan')")});
  await t.test('échec SQL après mutation : favoris et avis restaurés puis reprise',async()=>{
    const saved=await store.save(validateRecipe(recipeDraft()));await store.setNote(saved.id,2,'Avant');const before=await store.read();
    for(const marker of ['INSERT INTO household.recipe_favorites','INSERT INTO household.recipe_notes']){
      const broken=postgresRecipes({...db,transaction:work=>db.transaction(tx=>work({...tx,query:async(sql,values)=>{
        const result=await tx.query(sql,values);if(sql.startsWith(marker))await tx.query('SELECT 1/0');return result;
      }}))});
      const action=marker.includes('favorites')?()=>broken.setFavorite(saved.id,true):()=>broken.setNote(saved.id,5,'Après');
      await assert.rejects(action,{code:'22012'});assert.deepEqual(await store.read(),before);
    }
    assert.equal(await store.setNote(saved.id,4,'Reprise'),true);
  });
  await t.test('recette supprimée pendant attente : ni favori ni avis orphelin',async()=>{
    for(const method of ['setFavorite','setNote']){
      const saved=await store.save(validateRecipe(recipeDraft())),client=await f.pool.connect();let pending;
      try {
        await client.query('BEGIN');await lockHousehold(client);
        pending=method==='setFavorite'?store.setFavorite(saved.id,true):store.setNote(saved.id,3,'Ne doit pas rester');
        const until=Date.now()+1000;let waiting=false;
        while(Date.now()<until&&!waiting){waiting=(await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rows[0].n>0;if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));}
        assert.ok(waiting,'Attente réelle requise.');
        await client.query('DELETE FROM household.recipes WHERE id=$1',[saved.id]);await client.query('COMMIT');
        assert.equal(await pending,'unknown-recipe');
      } finally {await client.query('ROLLBACK');client.release();await pending;}
      assert.ok(!(await store.read()).some(r=>r.id===saved.id));
    }
  });
});
