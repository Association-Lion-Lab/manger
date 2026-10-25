const test=require('node:test');
const assert=require('node:assert/strict');
const {databaseFixture}=require('./database');
const {postgresHousehold}=require('../db/household');

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
  });
});
