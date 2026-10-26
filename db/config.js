const {readFileSync,statSync}=require('node:fs');
const {Pool}=require('pg');
const {poolOptions}=require('./postgres');
function readSecret(path,max){if(typeof path!=='string'||!path)throw new Error('Configuration PostgreSQL invalide.');const info=statSync(path);if(!info.isFile()||info.size>max)throw new Error('Configuration PostgreSQL invalide.');return readFileSync(path,'utf8').replace(/\r?\n$/,'');}
function postgresConfig(env=process.env,{administrative=false}={}){
  try{
    const user=env[administrative?'MANGER_PG_MIGRATION_USER':'MANGER_PG_USER'];
    const password=readSecret(env[administrative?'MANGER_PG_MIGRATION_PASSWORD_FILE':'MANGER_PG_PASSWORD_FILE'],4096);
    const mode=env.MANGER_PG_TLS||'verify-full';if(!['verify-full','disable-local'].includes(mode))throw new Error();
    const ssl=mode==='disable-local'?false:env.MANGER_PG_CA_FILE?{ca:readSecret(env.MANGER_PG_CA_FILE,65536),rejectUnauthorized:true}:true;
    const config={host:env.MANGER_PG_HOST,port:Number(env.MANGER_PG_PORT||5432),database:env.MANGER_PG_DATABASE,user,password,ssl};
    if(administrative&&(typeof env.MANGER_PG_USER!=='string'||!env.MANGER_PG_USER||user===env.MANGER_PG_USER))throw new Error();poolOptions(config);return config;
  }catch{throw Object.assign(new Error('Configuration PostgreSQL incomplète ou refusée. Vérifie les fichiers de secrets et les rôles séparés.'),{code:'MANGER_POSTGRES_CONFIG'});}
}
function administrativePool(config){
  const pool=new Pool({...poolOptions(config),max:1,query_timeout:35000,statement_timeout:30000,application_name:'manger-administration'});
  pool.on('error',()=>{});return pool;
}
module.exports={postgresConfig,administrativePool};
