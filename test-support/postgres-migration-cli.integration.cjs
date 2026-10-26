const test=require('node:test'),assert=require('node:assert/strict');
const {writeFile}=require('node:fs/promises'),{join}=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {databaseFixture}=require('./database');
const {migrationSourceFixture}=require('./migration-source-fixture');
const run=promisify(execFile);
test('reprise administrative via vrais sous-processus CLI',{timeout:60000},async t=>{
  const f=await databaseFixture(t),source=await migrationSourceFixture(t),secret=join(source.folder,'migration.secret');await writeFile(secret,f.migrationPool.options.password+'\n',{mode:0o600});
  const env={...process.env,MANGER_PG_HOST:'127.0.0.1',MANGER_PG_PORT:String(f.port),MANGER_PG_DATABASE:'manger_test',MANGER_PG_USER:'manger_test_app',MANGER_PG_MIGRATION_USER:'manger_test_migrator',MANGER_PG_MIGRATION_PASSWORD_FILE:secret,MANGER_PG_TLS:'disable-local'};
  const options={cwd:join(__dirname,'..'),env,windowsHide:true,timeout:30000};
  const result=await run(process.execPath,['migrate-postgres.js','import',source.home,source.accounts,'--source-stopped','--target-empty'],options);const report=JSON.parse(result.stdout);assert.equal(report.status,'ready');assert.equal(report.tables,22);assert.doesNotMatch(result.stdout,/password|username|token|tomate|Café/);
  const nonce=(await f.migrationPool.query('SELECT nonce FROM manger_meta.data_import')).rows[0].nonce;
  assert.equal(JSON.parse((await run(process.execPath,['migrate-postgres.js','verify',source.home,source.accounts,'--source-stopped',nonce],options)).stdout).status,'ready');
  await assert.rejects(run(process.execPath,['migrate-postgres.js','import',source.home,source.accounts,'--source-stopped','--target-empty'],options),error=>error.code===1&&!error.stdout&&/Reprise refusée/.test(error.stderr));
});
