const {randomUUID,createHash}=require('node:crypto');
const {TABLES,validateTables}=require('./migration-format');
const {readPostgresTables,verifyMigration,transferError}=require('./migration-verify');
const {lockTables,insertTables,restartSequences,sequenceStarts}=require('./postgres-transfer');
const {verifyStructure}=require('./db/structure');
const {reservePostgresClient}=require('./db/postgres');
async function emptyTarget(client){
  if((await client.query('SELECT 1 FROM manger_meta.data_import')).rowCount)throw transferError();
  for(const table of TABLES)if((await client.query(`SELECT 1 FROM ${table.key} LIMIT 1`)).rowCount)throw transferError();
}
async function migratePostgres(pool,source){
  validateTables(source?.tables);
  source={...source,tables:Object.fromEntries(Object.entries(source.tables).map(([key,rows])=>[key,rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,Buffer.isBuffer(value)?Buffer.from(value):value])))]))};
  sequenceStarts(source.tables);const hash=createHash('sha256').update(JSON.stringify(source.report?.fingerprints||[])).digest('hex'),nonce=randomUUID();
  const client=await reservePostgresClient(pool);let locked=false,committing=false;
  try{
    await client.query("SET search_path=pg_catalog; SET statement_timeout='30s'; SET lock_timeout='5s'; SET idle_in_transaction_session_timeout='10s'");
    await client.query('SELECT pg_advisory_lock(1296125511,1),pg_advisory_lock(1296125511,5),pg_advisory_lock(1296125511,4)');locked=true;
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');await lockTables(client);await verifyStructure(client);await emptyTarget(client);
    await client.query("INSERT INTO manger_meta.data_import(id,nonce,status,source_hash) VALUES(1,$1,'pending',$2)",[nonce,hash]);committing=true;await client.query('COMMIT');committing=false;
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');await lockTables(client);await verifyStructure(client);
    const marker=(await client.query('SELECT nonce,status FROM manger_meta.data_import WHERE id=1 FOR UPDATE')).rows[0];
    if(marker?.nonce!==nonce||marker.status!=='pending')throw transferError();
    for(const table of TABLES)if((await client.query(`SELECT 1 FROM ${table.key} LIMIT 1`)).rowCount)throw transferError();
    await insertTables(client,source.tables);
    const report=verifyMigration(source.tables,await readPostgresTables(client));await restartSequences(client,source.tables);await verifyStructure(client);
    await client.query("UPDATE manger_meta.data_import SET status='ready' WHERE id=1 AND nonce=$1",[nonce]);committing=true;await client.query('COMMIT');committing=false;
    return {status:'ready',...report};
  }catch(error){try{await client.query('ROLLBACK');}catch{}if(committing)throw Object.assign(new Error('Engagement de reprise incertain. Vérifie la cible sans relancer l’import.'),{code:'MANGER_TRANSFER_UNCERTAIN',nonce});throw transferError();}
  finally{
    try{if(locked)await client.query('SELECT pg_advisory_unlock(1296125511,4),pg_advisory_unlock(1296125511,5),pg_advisory_unlock(1296125511,1)');}
    catch{}
    // This administrative lease changed session settings and held session locks; never recycle it.
    client.release(true);
  }
}
async function inspectTransfer(pool,source,nonce){
  if(typeof nonce!=='string'||!/^[a-f0-9-]{36}$/.test(nonce))throw transferError();
  const client=await reservePostgresClient(pool);
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query('SET LOCAL search_path=pg_catalog');await verifyStructure(client);
    const marker=(await client.query('SELECT nonce,status FROM manger_meta.data_import WHERE id=1')).rows[0];
    if(!marker){await client.query('COMMIT');return {status:'not-started'};}
    if(marker.nonce!==nonce)throw transferError();
    const report=marker.status==='ready'?verifyMigration(source.tables,await readPostgresTables(client)):{};
    await client.query('COMMIT');return {status:marker.status,...report};
  }catch{await client.query('ROLLBACK').catch(()=>{});throw transferError();}finally{client.release(true);}
}
module.exports={migratePostgres,inspectTransfer};
if(require.main===module){
  (async()=>{
    const [command,home,accounts,flag,confirmation,...extra]=process.argv.slice(2);
    if(!['import','verify'].includes(command)||!home||!accounts||flag!=='--source-stopped'||!confirmation||extra.length||(command==='import'&&confirmation!=='--target-empty'))throw transferError();
    const source=await require('./migration-source').analyzeSource({home,accounts});
    const {postgresConfig,administrativePool}=require('./db/config'),config=postgresConfig(process.env,{administrative:true}),pool=administrativePool(config);
    let result;
    try{
      if(command==='import'){await require('./db/postgres-schema').migrateSchema(pool,process.env.MANGER_PG_USER);result=await migratePostgres(pool,source);}
      else result=await inspectTransfer(pool,source,confirmation);
      console.log(JSON.stringify(result,null,2));
    }finally{try{await pool.end();}catch(error){if(!result)throw error;console.error('Résultat ci-dessus confirmé ; fermeture du pool non confirmée. Vérifie les connexions sans relancer l’import.');process.exitCode=1;}}
  })().catch(error=>{
    console.error(error.code==='MANGER_TRANSFER_UNCERTAIN'?`Résultat incertain, ne relance pas l’import. Identifiant de contrôle : ${error.nonce}`:'Reprise refusée. Vérifie les copies arrêtées, la cible neuve et la configuration administrative. Aucun détail privé affiché.');process.exitCode=1;
  });
}
