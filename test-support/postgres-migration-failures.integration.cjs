const test=require('node:test'),assert=require('node:assert/strict');
const {databaseFixture}=require('./database');
const {migrationSourceFixture}=require('./migration-source-fixture');
const {analyzeSource}=require('../migration-source');
const {migratePostgres,inspectTransfer}=require('../migrate-postgres');
const {migrateSchema}=require('../db/postgres-schema');
const {TABLES}=require('../migration-format');
function intercept(pool,action){return {connect(callback){pool.connect((error,client)=>{if(error){callback(error);return;}callback(null,{query:(sql,args)=>action(client,sql,args),on:(...args)=>client.on(...args),off:(...args)=>client.off(...args),release:destroy=>client.release(destroy)});});}};}
test('reprise : pannes réelles, cible réservée et engagement incertain',{timeout:90000},async t=>{
  const f=await databaseFixture(t),owner=f.migrationPool,source=await analyzeSource(await migrationSourceFixture(t));
  const fresh=async()=>{await owner.query('DROP SCHEMA household,auth,manger_meta CASCADE');await migrateSchema(owner,'manger_test_app');};
  await t.test('panne après photo puis après recalage : données et séquences annulées, pending interdit la reprise',async()=>{
    for(const needle of ['INSERT INTO household.recipe_photos','ALTER SEQUENCE household.recipes_id_seq']){
      await fresh();let injected=false;
      const broken=intercept(owner,async(client,sql,args)=>{const result=await client.query(sql,args);if(typeof sql==='string'&&sql.startsWith(needle)){injected=true;await client.query('SELECT 1/0');}return result;});
      await assert.rejects(migratePostgres(broken,source),{code:'MANGER_TRANSFER_INVALID'});assert.equal(injected,true);
      for(const table of TABLES)assert.equal((await f.database.query(`SELECT count(*)::int AS n FROM ${table.key}`)).rows[0].n,0);
      assert.equal((await f.database.query('SELECT household.storage_status() AS s')).rows[0].s.ready,false);
      assert.deepEqual((await owner.query('SELECT last_value::float8 AS n,is_called FROM household.recipes_id_seq')).rows[0],{n:1,is_called:false});
      await assert.rejects(migratePostgres(owner,source),{code:'MANGER_TRANSFER_INVALID'});
    }
  });
  await t.test('réponse perdue après vrai COMMIT : ready confirmé sans nouvel import',async()=>{
    await fresh();let commits=0;
    const lost=intercept(owner,async(client,sql,args)=>{const result=await client.query(sql,args);if(sql==='COMMIT'&&++commits===2)throw new Error('synthetic lost acknowledgement');return result;});
    let uncertain;try{await migratePostgres(lost,source);assert.fail('Réponse incertaine attendue');}catch(error){assert.equal(error.code,'MANGER_TRANSFER_UNCERTAIN');uncertain=error;}
    const result=await inspectTransfer(owner,source,uncertain.nonce);assert.equal(result.status,'ready');assert.equal(result.tables,22);
    await assert.rejects(migratePostgres(owner,source),{code:'MANGER_TRANSFER_INVALID'});
  });
  await t.test('écriture ignorant le verrou entre transactions : pas de fusion ou suppression de cette ligne',async()=>{
    await fresh();let committed=false;
    const changed=intercept(owner,async(client,sql,args)=>{
      const result=await client.query(sql,args);if(sql==='COMMIT'&&!committed){committed=true;await f.database.query("INSERT INTO household.avoided_ingredients VALUES('Ligne concurrente')");}return result;
    });
    await assert.rejects(migratePostgres(changed,source),{code:'MANGER_TRANSFER_INVALID'});
    assert.deepEqual((await f.database.query('SELECT name FROM household.avoided_ingredients')).rows,[{name:'Ligne concurrente'}]);assert.equal((await f.database.query('SELECT household.storage_status() AS s')).rows[0].s.ready,false);
  });
  await t.test('séquence, trigger et RLS ajoutés après migration : refus avant réservation',async()=>{
    for(const sql of ['CREATE SEQUENCE household.rogue',"CREATE COLLATION household.rogue(provider=libc,locale='C')", "CREATE TABLE public.unknown(value integer); INSERT INTO public.unknown VALUES(42)","CREATE FUNCTION household.rogue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER rogue BEFORE INSERT ON household.recipes FOR EACH ROW EXECUTE FUNCTION household.rogue()",'ALTER TABLE household.recipes ENABLE ROW LEVEL SECURITY']){
      await fresh();await owner.query(sql);await assert.rejects(migratePostgres(owner,source),{code:'MANGER_TRANSFER_INVALID'});assert.equal((await owner.query('SELECT count(*)::int AS n FROM manger_meta.data_import')).rows[0].n,0);
      if(sql.startsWith('CREATE TABLE public.unknown'))await owner.query('DROP TABLE public.unknown');
    }
  });
  await t.test('deux transferts concurrents : un seul engagement et aucune fusion',async()=>{
    await fresh();const results=await Promise.allSettled([migratePostgres(owner,source),migratePostgres(owner,source)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'MANGER_TRANSFER_INVALID');
    assert.equal((await f.database.query('SELECT count(*)::int AS n FROM household.recipes')).rows[0].n,source.tables['household.recipes'].length);
  });
  await t.test('vraie coupure après COMMIT : processus vivant et état confirmé après redémarrage',async()=>{
    await fresh();let commits=0,entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
    const disconnect=intercept(owner,async(client,sql,args)=>{const result=await client.query(sql,args);if(sql==='COMMIT'&&++commits===2){entered();await gate;}return result;});
    const pending=migratePostgres(disconnect,source);pending.catch(()=>{});let uncertain;
    try{await ready;await f.stop();try{await pending;assert.fail('Engagement incertain attendu');}catch(error){assert.equal(error.code,'MANGER_TRANSFER_UNCERTAIN');uncertain=error;}}
    finally{release();await pending.catch(()=>{});await f.start();}
    assert.equal((await inspectTransfer(owner,source,uncertain.nonce)).status,'ready');
  });
  await t.test('ancien prototype v1 avec dérive : refus sans sceller son schéma inconnu',async()=>{
    await owner.query('DROP SCHEMA household,auth,manger_meta CASCADE');
    await owner.query('CREATE SCHEMA manger_meta; CREATE TABLE manger_meta.schema_migrations(version integer PRIMARY KEY,name text NOT NULL,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const old=require('../db/migrations/001-initial'),checksum=require('node:crypto').createHash('sha256').update(old.sql).digest('hex');await owner.query(old.sql);await owner.query('INSERT INTO manger_meta.schema_migrations(version,name,checksum) VALUES($1,$2,$3)',[1,old.name,checksum]);
    await owner.query("CREATE SEQUENCE household.rogue; INSERT INTO household.recipes(title,minutes,servings) VALUES('Conserver',1,1)");
    await assert.rejects(migrateSchema(owner,'manger_test_app'),/cible neuve/);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM manger_meta.schema_migrations')).rows[0].n,1);assert.equal((await owner.query('SELECT title FROM household.recipes')).rows[0].title,'Conserver');
    assert.equal((await owner.query("SELECT to_regclass('manger_meta.data_import') AS t")).rows[0].t,null);
  });
});
