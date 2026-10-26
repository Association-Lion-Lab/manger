const {storageEngine}=require('./storage');
const {schemaVersion}=require('./postgres-schema');
const {structureFingerprint}=require('./structure');
const {TABLES}=require('../migration-format');
const notReady=()=>Object.assign(new Error('Candidat PostgreSQL non prêt : démarrage refusé sans repli SQLite.'),{code:'MANGER_POSTGRES_NOT_READY'});
function requirePostgresCandidate(env=process.env){
  if(storageEngine(env)!=='postgres'||env.MANGER_POSTGRES_CANDIDATE!=='1')throw notReady();
}
async function checkApplicationStorage(db){
  return db.transaction(async tx=>{
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const role=(await tx.query(`SELECT r.rolcanlogin,
      r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls AS privileged,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS membership,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owns_relation,
      r.oid=d.datdba AS owns_database,
      has_database_privilege(current_user,current_database(),'CREATE') OR has_database_privilege(current_user,current_database(),'TEMP') AS database_admin,
      EXISTS(SELECT 1 FROM (
        SELECT p.proacl AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname~'^pg_' OR n.nspname='information_schema'
        UNION ALL SELECT c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname~'^pg_' OR n.nspname='information_schema'
        UNION ALL SELECT a.attacl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname~'^pg_' OR n.nspname='information_schema'
        UNION ALL SELECT nspacl FROM pg_namespace WHERE nspname~'^pg_' OR nspname='information_schema'
        UNION ALL SELECT paracl FROM pg_parameter_acl
      ) grants CROSS JOIN LATERAL aclexplode(grants.acl) rights WHERE rights.grantee=r.oid) AS system_acl,
      has_schema_privilege(current_user,'public','CREATE') OR has_schema_privilege(current_user,'manger_meta','USAGE') AS administrative
      FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`)).rows[0];
    if(!role?.rolcanlogin||role.privileged||role.membership||role.owns_relation||role.owns_database||role.administrative||role.database_admin||role.system_acl)throw notReady();
    const status=(await tx.query('SELECT household.storage_status() AS status')).rows[0]?.status;
    if(status?.version!==schemaVersion||!status.ready||!status.structureChecksum||status.structureChecksum!==await structureFingerprint(tx))throw notReady();
    for(const table of TABLES)await tx.query(`SELECT 1 FROM ${table.key} LIMIT 0`);
    return true;
  });
}
module.exports={requirePostgresCandidate,checkApplicationStorage};
