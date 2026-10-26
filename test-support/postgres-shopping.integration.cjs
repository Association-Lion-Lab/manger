const test=require('node:test'),assert=require('node:assert/strict');
const {databaseFixture}=require('./database');
const {postgresShopping}=require('../db/shopping');
const {postgresRecipes}=require('../db/recipes');
const {postgresMeals}=require('../db/meals');
const {lockHousehold}=require('../db/household');
const {shoppingContract}=require('./shopping-contract');
test('courses PostgreSQL réel',{timeout:60000},async t=>{
  const f=await databaseFixture(t),db=f.database,store=postgresShopping(db),start='2026-11-02';
  await shoppingContract(t,{store,recipes:postgresRecipes(db),meals:postgresMeals(db)});
  await t.test('rollback après mise à jour effective, aucune coche partielle',async()=>{
    await store.check({weekStart:start,name:'carotte',unit:'g',checked:false});
    const before=await store.read(start),broken=postgresShopping({...db,transaction:work=>db.transaction(async tx=>{await work(tx);await tx.query('SELECT 1/0');})});
    await assert.rejects(broken.sync({weekStart:start,items:before}),{code:'22012'});assert.deepEqual(await store.read(start),before);
  });
  await t.test('synchronisation relit la quantité après attente réelle du verrou',async()=>{
    const before=await store.read(start),client=await f.pool.connect();let pending;
    try{
      await client.query('BEGIN');await lockHousehold(client);pending=store.sync({weekStart:start,items:before});pending.catch(()=>{});
      let waiting=false;const limit=Date.now()+1800;
      while(Date.now()<limit&&!waiting){waiting=(await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rows[0].n>0;if(!waiting)await new Promise(r=>setTimeout(r,10));}
      assert.ok(waiting,'La synchronisation attend réellement le verrou du foyer');await client.query('UPDATE household.recipe_ingredients SET amount=50');await client.query('COMMIT');
      assert.deepEqual(await pending,{accepted:[],rejected:[0]});assert.equal((await store.read(start))[0].checked,false);
    }finally{await client.query('ROLLBACK');client.release();await pending?.catch(()=>{});}
  });
  await t.test('IDs zéro/grands et ordre historique des rayons conservés',async()=>{
    await db.query("INSERT INTO household.shopping_manual(id,week_start,name,amount,unit,aisle) VALUES(0,$1,'Zéro',1,'pièce',''),(5000000001,$1,'Grand',1,'pièce','')",[start]);
    await store.check({weekStart:start,name:'Zéro',unit:'pièce',manualId:0,checked:true});
    await db.query("INSERT INTO household.shopping_aisles(name,unit,aisle,sort_order) VALUES('carottes','g','Maison',-1),('carotte','g','Frais',5000000001)");
    const rows=await store.read(start);assert.equal(rows[0].aisle,'Frais');assert.equal(rows.find(i=>i.manualId===0).checked,true);assert.equal(typeof rows.find(i=>i.manualId===5000000001).manualId,'number');
  });
});
