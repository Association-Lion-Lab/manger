const test=require('node:test'),assert=require('node:assert/strict');
const {databaseFixture}=require('./database');
const {postgresCalculations}=require('../db/calculations');
const {postgresPantry}=require('../db/pantry');
const {postgresHousehold}=require('../db/household');
const {postgresRecipes}=require('../db/recipes');
const {postgresMeals}=require('../db/meals');
const {calculationContract}=require('./calculations-contract');
test('placard et calculs PostgreSQL réel',{timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,calc=postgresCalculations(db),pantry=postgresPantry(db);
  await calculationContract(t,{calc,pantry,home:postgresHousehold(db),recipes:postgresRecipes(db),meals:postgresMeals(db)});
  await t.test('arrondis SQL réels au centième, sans préarrondi quotidien',async()=>{
    await db.query('DELETE FROM household.meals');await db.query('DELETE FROM household.pantry');
    await db.query('UPDATE household.recipes SET servings=2');await db.query('UPDATE household.recipe_ingredients SET amount=0.01');
    const id=(await db.query('SELECT id::float8 AS id FROM household.recipes')).rows[0].id;
    for(const [i,people] of [1,2,4].entries())await postgresMeals(db).save({date:`2026-11-0${i+2}`,slot:'midi',location:'home',occasion:'regular',recipeId:id,title:'Riz',people});
    assert.ok((await calc.shoppingList('2026-11-02')).every(i=>i.amount===.04));
    await db.query('UPDATE household.recipes SET servings=1');await db.query('UPDATE household.recipe_ingredients SET amount=0.0044');await db.query('UPDATE household.meals SET people=1');await db.query("DELETE FROM household.meals WHERE date='2026-11-04'");
    assert.ok((await calc.shoppingList('2026-11-02')).every(i=>i.amount===.01));assert.ok((await calc.shoppingList('2026-11-02','2026-11-02')).every(i=>i.amount===0));
  });
  await t.test('la photographie garde la même version malgré une modification concurrente',async()=>{
    let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let paused=false;
    const concurrent=postgresCalculations({...db,transaction:work=>db.transaction(tx=>work({query:async(sql,args)=>{
      const result=await tx.query(sql,args);if(!paused&&sql.includes('ORDER BY r.title')){paused=true;entered();await gate;}return result;
    }}))});
    const reading=concurrent.shoppingList('2026-11-02');await ready;
    try{await db.query('UPDATE household.recipe_ingredients SET amount=10');}finally{release();}
    assert.ok((await reading).every(i=>i.amount===.01));assert.ok((await calc.shoppingList('2026-11-02')).every(i=>i.amount===20));
  });
  await t.test('quota sérialisé et rollback après insertion effective',async()=>{
    await db.query(`INSERT INTO household.pantry(food_key,name,unit,amount,recorded_on,explicit_lot)
      SELECT convert_to('lot:'||n,'UTF8'),'riz','g',1,'2026-01-01',1 FROM generate_series(1,499) n`);
    const results=await Promise.allSettled([1,2].map(()=>pantry.save({name:'riz',unit:'g',amount:1,newLot:true})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'MANGER_PANTRY_INPUT');
    await db.query('DELETE FROM household.pantry');
    const broken=postgresPantry({...db,transaction:work=>db.transaction(async tx=>{await work(tx);await tx.query('SELECT 1/0');})});
    await assert.rejects(broken.save({name:'riz',unit:'g',amount:1}));assert.deepEqual(await calc.pantry(),[]);
    await pantry.save({name:'riz',unit:'g',amount:2});const first=(await calc.pantry())[0];await pantry.save({id:first.id,name:'riz',unit:'g',amount:3});
    assert.deepEqual([...(await db.query('SELECT food_key FROM household.pantry')).rows[0].food_key],Array.from(Buffer.from('riz\0g')));
  });
});
