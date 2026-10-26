const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const {join}=require('node:path'),{tmpdir}=require('node:os');
const {postgresConfig}=require('./db/config');
test('configuration PostgreSQL : fichiers de secrets, TLS et rôles explicites sans reprise implicite PG',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'manger-pg-config-'));t.after(()=>rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100}));const file=join(folder,'secret');await writeFile(file,' spaces-preserved \n',{mode:0o600});
  const env={MANGER_PG_HOST:'127.0.0.1',MANGER_PG_DATABASE:'manger',MANGER_PG_USER:'manger_app',MANGER_PG_PASSWORD_FILE:file,MANGER_PG_MIGRATION_USER:'manger_migrator',MANGER_PG_MIGRATION_PASSWORD_FILE:file,PGHOST:'untrusted.invalid',PGSSLMODE:'disable'};
  assert.equal(postgresConfig(env).password,' spaces-preserved ');assert.equal(postgresConfig(env).ssl,true);assert.equal(postgresConfig(env,{administrative:true}).user,'manger_migrator');
  assert.equal(postgresConfig({...env,MANGER_PG_TLS:'disable-local'}).ssl,false);
  for(const change of [{MANGER_PG_TLS:'disable'},{MANGER_PG_TLS:'disable-local',MANGER_PG_HOST:'remote.invalid'},{MANGER_PG_PASSWORD_FILE:folder},{MANGER_PG_PASSWORD_FILE:undefined}])assert.throws(()=>postgresConfig({...env,...change}),{code:'MANGER_POSTGRES_CONFIG'});
  assert.throws(()=>postgresConfig({...env,MANGER_PG_MIGRATION_USER:'manger_app'},{administrative:true}),{code:'MANGER_POSTGRES_CONFIG'});
});
