const {postgresConfig,administrativePool}=require('./db/config');
const {migrateSchema}=require('./db/postgres-schema');
async function upgradeSchema(env=process.env){
  const pool=administrativePool(postgresConfig(env,{administrative:true}));
  try{return await migrateSchema(pool,env.MANGER_PG_USER);}finally{await pool.end();}
}
if(require.main===module){
  if(process.argv.length!==3||process.argv[2]!=='--apply'){
    console.error('Usage : node postgres-schema.js --apply ; arrêter les écritures et sauvegarder avant cette opération.');process.exitCode=1;
  }else upgradeSchema().then(result=>console.log(JSON.stringify(result))).catch(()=>{
    console.error('Migration de schéma non confirmée. Vérifie le schéma avant de relancer ; aucun détail privé affiché.');process.exitCode=1;
  });
}
module.exports={upgradeSchema};
