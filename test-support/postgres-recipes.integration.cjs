const test=require('node:test');
const assert=require('node:assert/strict');
const {databaseFixture}=require('./database');
const {postgresRecipes}=require('../db/recipes');
const {lockHousehold}=require('../db/household');
const {validateRecipe}=require('../server');
const {recipeDraft}=require('./recipe-fixture');

test('recettes PostgreSQL : lecture, enfants et retrait atomiques', {timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,store=postgresRecipes(db),draft=patch=>validateRecipe(recipeDraft(patch));let saved;
  const snapshot=()=>Promise.all(['recipes','ingredients','recipe_ingredients','recipe_steps','recipe_photos','recipe_favorites','recipe_notes','meals'].map(table=>
    db.query(`SELECT to_jsonb(t) AS row FROM household.${table} t ORDER BY to_jsonb(t)::text`).then(r=>r.rows)));
  await t.test('aucun amorçage, DTO numérique, ordre et précision des ingrédients/étapes',async()=>{
    assert.deepEqual(await store.read(),[]);saved=await store.save(draft());
    assert.ok(Number.isSafeInteger(saved.id));assert.deepEqual(saved,{id:saved.id,title:'Œufs aux tomates',minutes:20,servings:2,tags:['japon','été'],diet:'vegetarian',sourceUrl:'https://example.org/recette?x=1',favorite:false,hasPhoto:false,
      ingredients:[{name:'tomate',unit:'g',amount:120.125,preparation:'cooked'},{name:'œuf',unit:'pièce',amount:2.375,preparation:'raw'}],
      steps:[{position:1,kind:'cook',instruction:'Cuire les tomates.',minutes:15},{position:2,kind:'serve',instruction:'Servir.',minutes:null}]});
    assert.deepEqual(await store.read(),[saved]);assert.ok(!Object.hasOwn(saved,'note'));
  });
  await t.test('édition conserve ID et ingrédient partagé, enfants remplacés, titres non uniques',async()=>{
    const id=(await db.query("SELECT id FROM household.ingredients WHERE name='tomate'")).rows[0].id;
    const updated=await store.save(draft({ingredients:[{name:'tomate',unit:'g',amount:10}],steps:[{kind:'prep',instruction:'Couper.',minutes:0}]}),saved.id);
    assert.equal(updated.id,saved.id);assert.deepEqual(updated.ingredients,[{name:'tomate',unit:'g',amount:10,preparation:'unknown'}]);
    assert.deepEqual(updated.steps,[{position:1,kind:'prep',instruction:'Couper.',minutes:0}]);
    assert.equal((await db.query("SELECT id FROM household.ingredients WHERE name='tomate'")).rows[0].id,id);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM household.ingredients')).rows[0].n,2);
    const duplicate=await store.save(draft());assert.notEqual(duplicate.id,saved.id);assert.equal(duplicate.title,saved.title);
    assert.equal(await store.save(draft(),9000000000),'unknown-recipe');assert.equal(await store.remove(9000000000),'unknown-recipe');
    assert.equal(await store.remove(duplicate.id),true);
  });
  await t.test('photo liée à la sauvegarde : copie, conservation, retrait ; avis/favori lisibles et préservés',async()=>{
    const photo='data:image/jpeg;base64,/9j/2Q==';
    const source=await store.save(draft({photo}));assert.equal(source.hasPhoto,true);
    const copy=await store.save(draft({photoCopyId:source.id}));assert.equal(copy.hasPhoto,true);
    assert.deepEqual((await db.query('SELECT data FROM household.recipe_photos WHERE recipe_id=$1',[copy.id])).rows[0].data,Buffer.from([255,216,255,217]));
    await db.query('INSERT INTO household.recipe_favorites VALUES($1)',[copy.id]);await db.query("INSERT INTO household.recipe_notes(recipe_id,rating,note) VALUES($1,4,'à refaire')",[copy.id]);
    const edited=await store.save(draft(),copy.id);assert.equal(edited.hasPhoto,true);assert.equal(edited.favorite,true);assert.equal(edited.rating,4);assert.equal(edited.note,'à refaire');
    for(const sourceId of [9000000000,saved.id,copy.id]){
      assert.equal((await store.save(draft({photoCopyId:sourceId}),copy.id)).hasPhoto,true);
      assert.deepEqual((await db.query('SELECT data FROM household.recipe_photos WHERE recipe_id=$1',[copy.id])).rows[0].data,Buffer.from([255,216,255,217]));
    }
    const explicit=Buffer.from([255,216,1,2,255,217]);
    await store.save(draft({photo:'data:image/jpeg;base64,'+explicit.toString('base64'),photoCopyId:source.id}),copy.id);
    assert.deepEqual((await db.query('SELECT data FROM household.recipe_photos WHERE recipe_id=$1',[copy.id])).rows[0].data,explicit);
    assert.equal((await store.save(draft({photo:null,photoCopyId:source.id}),copy.id)).hasPhoto,false);
    assert.equal(await store.remove(source.id),true);assert.equal(await store.remove(copy.id),true);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM household.recipe_notes')).rows[0].n,0);
  });
  await t.test('référence directe et assiette protègent le retrait, titre du repas mis à jour',async()=>{
    const other=await store.save(draft({title:'Autre'}));
    const member=(await db.query("INSERT INTO household.members(name,diet) VALUES('Fixture','vegetarian') RETURNING id")).rows[0].id;
    const meal=(await db.query("INSERT INTO household.meals(date,slot,location,occasion,people,title,recipe_id) VALUES('2026-10-25','midi','home','regular',2,'Ancien',$1) RETURNING id",[saved.id])).rows[0].id;
    await db.query('INSERT INTO household.meal_dishes(meal_id,member_id,recipe_id,portions,protein_id) VALUES($1,$2,$3,1,NULL)',[meal,member,other.id]);
    for(const id of [saved.id,other.id])assert.equal(await store.remove(id),'used-recipe');
    await store.save(draft({title:'Nouveau titre'}),saved.id);assert.equal((await db.query('SELECT title FROM household.meals WHERE id=$1',[meal])).rows[0].title,'Nouveau titre');
    await store.save(draft({title:'Assiette'}),other.id);assert.equal((await db.query('SELECT title FROM household.meals WHERE id=$1',[meal])).rows[0].title,'Nouveau titre');
    assert.equal((await db.query('SELECT protein_id FROM household.meal_dishes')).rows[0].protein_id,null);
    await db.query('DELETE FROM household.meals WHERE id=$1',[meal]);assert.equal(await store.remove(other.id),true);
  });
  await t.test('erreur après enfants ou lecture du DTO : état entièrement annulé et reprise',async()=>{
    const a='data:image/jpeg;base64,/9j/2Q==',b='data:image/jpeg;base64,'+Buffer.from([255,216,1,2,255,217]).toString('base64');
    await store.save(draft({photo:a}),saved.id);const source=await store.save(draft({title:'Photo à copier',photo:b}));
    for(const failed of ['INSERT INTO household.recipe_steps','SELECT r.id'])for(const patch of [{photo:b},{photo:null},{photoCopyId:source.id}]) {
      const before=await snapshot();
      const broken=postgresRecipes({...db,transaction:work=>db.transaction(tx=>work({...tx,query:(sql,values)=>
        sql.includes(failed)?tx.query('SELECT 1/0'):tx.query(sql,values)}))});
      await assert.rejects(broken.save(draft({title:'Ne doit pas rester',ingredients:[{name:'nouveau',unit:'g',amount:1}],...patch}),saved.id),{code:'22012'});
      assert.deepEqual(await snapshot(),before);
    }
    assert.equal((await store.save(draft(),saved.id)).id,saved.id);
    await store.remove(source.id);
  });
  await t.test('100 ingrédients et 50 étapes, positions publiques conservées',async()=>{
    const full=draft({ingredients:Array.from({length:100},(_,i)=>({name:`aliment ${String(i).padStart(3,'0')}`,unit:'g',amount:i+.125})),steps:Array.from({length:50},(_,i)=>({kind:'prep',instruction:`Étape ${i+1}`,minutes:i}))});
    const result=await store.save(full);assert.equal(result.ingredients.length,100);assert.equal(result.steps.length,50);
    assert.deepEqual(result.steps.map(s=>s.position),Array.from({length:50},(_,i)=>i+1));assert.equal(await store.remove(result.id),true);
  });
  await t.test('lecture pendant remplacement non engagé : ancienne recette entière',async()=>{
    const before=(await store.read()).find(r=>r.id===saved.id);
    let ready,release;const entered=new Promise(resolve=>{ready=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    const slow=postgresRecipes({...db,transaction:work=>db.transaction(tx=>work({...tx,query:async(sql,values)=>{
      const result=await tx.query(sql,values);if(sql.startsWith('DELETE FROM household.recipe_steps')){ready();await gate;}return result;
    }}))});
    const pending=slow.save(draft({title:'Après la pause'}),saved.id);
    try {await Promise.race([entered,pending.then(()=>assert.fail('Pause attendue'))]);assert.deepEqual((await store.read()).find(r=>r.id===saved.id),before);}
    finally {release();await pending;}
  });
  await t.test('deux éditions simultanées : réponses et état final sans mélange d’enfants',async()=>{
    const inputs=['A','B'].map(mark=>draft({title:mark,ingredients:[{name:mark,unit:'g',amount:1}],steps:[{kind:'prep',instruction:mark,minutes:1}]}));
    const results=await Promise.all(inputs.map(value=>store.save(value,saved.id)));
    for(const [i,result] of results.entries()){assert.equal(result.title,inputs[i].title);assert.equal(result.ingredients[0].name,inputs[i].title.toLowerCase());assert.equal(result.steps[0].instruction,inputs[i].title);}
    const final=(await store.read()).find(r=>r.id===saved.id);assert.ok(results.some(value=>JSON.stringify(value)===JSON.stringify(final)));
  });
  await t.test('suppression en attente : référence de repas créée avant validation conservée',async()=>{
    const client=await f.pool.connect();let pending;
    try {
      await client.query('BEGIN');await lockHousehold(client);pending=store.remove(saved.id);
      const until=Date.now()+1000;let waiting=false;
      while(Date.now()<until&&!waiting){waiting=(await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rows[0].n>0;if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));}
      assert.ok(waiting,'Attente réelle du verrou requise.');
      await client.query("INSERT INTO household.meals(date,slot,location,occasion,people,title,recipe_id) VALUES('2026-10-25','soir','home','regular',2,'À garder',$1)",[saved.id]);
      await client.query('COMMIT');assert.equal(await pending,'used-recipe');
    } finally {await client.query('ROLLBACK');client.release();await pending;}
    assert.ok((await store.read()).some(r=>r.id===saved.id));
  });
});
