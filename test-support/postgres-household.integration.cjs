const test=require('node:test');
const assert=require('node:assert/strict');
const {databaseFixture}=require('./database');
const {postgresHousehold,lockHousehold}=require('../db/household');

test('personnes, préférences et protéines sur PostgreSQL réel', {timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,home=postgresHousehold(db);
  assert.equal((await f.pool.query('SHOW statement_timeout')).rows[0].statement_timeout,'1s');
  assert.equal((await f.migrationPool.query('SHOW statement_timeout')).rows[0].statement_timeout,'1s');
  let member,other,protein;
  await t.test('lecture vide sans amorçage, types et goûts personnels/global séparés',async()=>{
    assert.deepEqual(await home.read(),{avoidedIngredients:[],members:[],proteins:[]});
    await home.setPreferences(['tomate crue','œuf']);
    member=await home.addMember({name:'Camille',diet:'vegan',avoidedIngredients:['tomate cuite']});
    other=await home.addMember({name:'camille',diet:'omnivore'});
    assert.equal(typeof member,'number');assert.ok(Number.isSafeInteger(member));
    const current=await home.read();assert.deepEqual(current.avoidedIngredients,['tomate crue','œuf']);
    assert.deepEqual(current.members,[{id:member,name:'Camille',diet:'vegan',avoidedIngredients:['tomate cuite']},{id:other,name:'camille',diet:'omnivore',avoidedIngredients:[]}]);
  });
  await t.test('édition sans goûts les conserve, liste vide efface, nom unique sensible à la casse',async()=>{
    assert.equal(await home.addMember({name:'Camille',diet:'vegan'}),'duplicate-member');
    assert.equal(await home.editMember(member,{name:'Camille',diet:'vegetarian'}),true);
    assert.deepEqual((await home.read()).members[0].avoidedIngredients,['tomate cuite']);
    assert.equal(await home.editMember(member,{name:'camille',diet:'vegan'}),'duplicate-member');
    assert.equal(await home.editMember(member,{name:'Camille',diet:'vegan',avoidedIngredients:[]}),true);
    assert.deepEqual((await home.read()).members[0].avoidedIngredients,[]);
    assert.equal(await home.editMember(9000000000,{name:'unknown',diet:'vegan'}),'unknown-member');
  });
  await t.test('protéines : précision et unicité, édition et suppression inconnues',async()=>{
    protein=await home.addProtein({name:'tofu',category:'plant',amount:120.125,unit:'g'});
    assert.equal(await home.addProtein({name:'tofu',category:'plant',amount:10,unit:'g'}),'duplicate-protein');
    assert.equal(await home.editProtein(protein,{name:'tofu',category:'plant',amount:125.375,unit:'g'}),true);
    assert.deepEqual((await home.read()).proteins,[{id:protein,name:'tofu',category:'plant',amount:125.375,unit:'g'}]);
    assert.equal(await home.removeProtein(9000000000),'unknown-protein');
  });
  await t.test('régimes et références des deux tables de repas, sans supplément reste NULL',async()=>{
    const second=await home.addProtein({name:'tempeh',category:'plant',amount:100,unit:'g'});
    await db.query("INSERT INTO household.recipes(title,minutes,servings,diet) VALUES('fixture',20,2,'vegan')");
    const meal=(await db.query("INSERT INTO household.meals(date,slot,location,occasion,people,title) VALUES('2026-10-25','midi','home','regular',3,'fixture') RETURNING id")).rows[0].id;
    await db.query('INSERT INTO household.meal_assignments VALUES($1,$2,$3,1)',[meal,member,protein]);
    await db.query('INSERT INTO household.meal_dishes(meal_id,member_id,recipe_id,portions,protein_id) VALUES($1,$2,1,1,$3),($1,$4,1,1,NULL)',[meal,member,second,other]);
    for(const id of [protein,second]) {
      assert.equal(await home.removeProtein(id),'used-protein');
      assert.equal(await home.editProtein(id,{name:'rejected',category:'meat',amount:100,unit:'g'}),'incompatible-protein');
    }
    assert.equal((await db.query('SELECT protein_id FROM household.meal_dishes WHERE member_id=$1',[other])).rows[0].protein_id,null);
    await db.query("INSERT INTO auth.accounts(username,password,admin) VALUES('camille','synthetic-hash',1)");
    assert.equal(await home.removeMember(member),true);assert.equal(await home.removeMember(member),'unknown-member');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM household.meal_assignments')).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM household.meal_dishes')).rows[0].n,1);
    assert.equal((await db.query('SELECT people FROM household.meals')).rows[0].people,3);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.accounts')).rows[0].n,1);
    assert.equal(await home.removeProtein(protein),true);
  });
  await t.test('échec après effacement des goûts : aucun remplacement partiel',async()=>{
    const before=await home.read();
    const broken=postgresHousehold({...db,transaction:work=>db.transaction(tx=>work({...tx,query:(sql,values)=>
      tx.query(sql==='INSERT INTO household.avoided_ingredients(name) VALUES($1)'?'SELECT 1/0':sql,sql==='INSERT INTO household.avoided_ingredients(name) VALUES($1)'?[]:values)}))});
    await assert.rejects(broken.setPreferences(['must-not-apply']),{code:'22012'});
    assert.deepEqual(await home.read(),before);
    await home.setPreferences(['reprise']);assert.deepEqual((await home.read()).avoidedIngredients,['reprise']);
  });
  await t.test('deux remplacements concurrents ne fusionnent pas les goûts, lecture pendant transaction cohérente',async()=>{
    await Promise.all([home.setPreferences(['a','b']),home.setPreferences(['c','d'])]);
    const before=(await home.read()).avoidedIngredients;assert.ok(JSON.stringify(before)==='["a","b"]'||JSON.stringify(before)==='["c","d"]');
    let release,ready;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{ready=resolve;});
    const write=db.transaction(async tx=>{await lockHousehold(tx);await tx.query('DELETE FROM household.avoided_ingredients');
      await tx.query("INSERT INTO household.avoided_ingredients VALUES('atomic')");ready();await gate;});
    try {await entered;assert.deepEqual((await home.read()).avoidedIngredients,before);}
    finally {release();await write;}
    assert.deepEqual((await home.read()).avoidedIngredients,['atomic']);
  });
  await t.test('catégorie revalidée après attente du verrou et nouveau régime, deux tables de repas',async()=>{
    const who=await home.addMember({name:'Race',diet:'omnivore'});
    const meal=(await db.query('SELECT id FROM household.meals LIMIT 1')).rows[0].id;
    for(const table of ['meal_assignments','meal_dishes']) {
      const p=await home.addProtein({name:table,category:'plant',amount:1,unit:'g'});
      await home.editMember(who,{name:'Race',diet:'omnivore'});
      if(table==='meal_assignments')await db.query('INSERT INTO household.meal_assignments VALUES($1,$2,$3,1)',[meal,who,p]);
      else await db.query('INSERT INTO household.meal_dishes(meal_id,member_id,recipe_id,portions,protein_id) VALUES($1,$2,1,1,$3)',[meal,who,p]);
      const client=await f.pool.connect();let pending;
      try {
        await client.query('BEGIN');await lockHousehold(client);
        pending=home.editProtein(p,{name:table,category:'egg',amount:1,unit:'g'});
        // Observe actual lock waiting; no guessed timer decides the race ordering.
        const until=Date.now()+2000;let waiting=false;
        while(Date.now()<until&&!waiting) {
          waiting=(await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rows[0].n>0;
          if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.ok(waiting,'La mutation doit réellement attendre le verrou du foyer.');
        await client.query("UPDATE household.members SET diet='vegan' WHERE id=$1",[who]);await client.query('COMMIT');
        assert.equal(await pending,'incompatible-protein');
      } finally {await client.query('ROLLBACK');client.release();await pending;}
      assert.equal((await home.read()).proteins.find(row=>row.id===p).category,'plant');
      await db.query(`DELETE FROM household.${table} WHERE member_id=$1`,[who]);await home.removeProtein(p);
    }
    await home.removeMember(who);
  });
});
