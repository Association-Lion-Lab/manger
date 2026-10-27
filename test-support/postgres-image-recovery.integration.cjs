const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {mkdtemp,mkdir,writeFile,rm}=fs.promises;
const {join}=require('node:path'),{tmpdir}=require('node:os');
const {databaseFixture}=require('./database'),{postgresFixture}=require('./postgres');
const {analyzeSource}=require('../migration-source'),{migratePostgres}=require('../migrate-postgres');
const {backupInstance,verifyInstance,restoreInstance,openInstance}=require('../postgres-instance');
const {createPostgresRuntime}=require('../postgres-app'),{openPostgres}=require('../db/postgres');
const {createLocalTls}=require('../create-local-tls');
const root=join(__dirname,'..');

function config(f,administrative=true){
  const o=(administrative?f.migrationPool:f.pool).options;
  return {host:o.host,port:o.port,database:o.database,user:o.user,password:o.password,ssl:false};
}
async function program(name,env,mappedFs=fs){
  const state={env,getuid:()=>1000,exitCode:0};
  const code=fs.readFileSync(join(root,'scripts',name),'utf8').replace('(async()=>{','return (async()=>{');
  const load=name=>name==='node:fs'?mappedFs:name.startsWith('./')?require(join(root,name)):require(name);
  await Function('require','process',code)(load,state);
  assert.equal(state.exitCode,0,`Programme ${name}, mode ${env.MANGER_PROBE_MODE||'source'}`);
}
async function runtime(t,f,folder,{secure=false}={}){
  const password=join(folder,'password');await writeFile(password,config(f,false).password,{flag:'wx',mode:0o600});
  const cert=join(folder,'tls');if(secure)createLocalTls('127.0.0.1',cert,process.env.OPENSSL||'openssl');
  const app=await createPostgresRuntime({...process.env,MANGER_STORAGE:'postgres',MANGER_POSTGRES_CANDIDATE:'1',MANGER_PG_HOST:'127.0.0.1',MANGER_PG_PORT:String(f.port),MANGER_PG_DATABASE:'manger_test',MANGER_PG_USER:'manger_test_app',MANGER_PG_PASSWORD_FILE:password,MANGER_PG_TLS:'disable-local',MANGER_DATA_DIR:join(folder,'data'),MANGER_TLS_CERT:secure?join(cert,'server/server.crt'):'',MANGER_TLS_KEY:secure?join(cert,'server/server.key'):'',MANGER_TLS_CA:secure?join(cert,'ca.crt'):'',MANGER_SMTP_HOST:''});
  t.after(()=>app.close());await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
  return app;
}
function tlsFetch(ca){
  return (url,options={})=>new Promise((resolve,reject)=>{
    const request=require('node:https').request(url,{method:options.method,headers:options.headers,signal:options.signal,ca},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.once('error',reject);
      response.once('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));
    });
    request.once('error',reject);request.end(options.body);
  });
}
async function probe(app,mode,folder){
  const secure=Boolean(app.server.setSecureContext),base=`${secure?'https':'http'}://127.0.0.1:${app.server.address().port}`;
  const rewrite=file=>typeof file==='string'&&file.startsWith('/data/')?join(folder,'data',file.slice(6)):file;
  const mapped={...fs,existsSync:file=>fs.existsSync(rewrite(file)),readFileSync:(file,...args)=>fs.readFileSync(rewrite(file),...args),writeFileSync:(file,...args)=>fs.writeFileSync(rewrite(file),...args),readdirSync:file=>file==='/run/secrets'?['pg_app_password','pg_ca',...(secure?['web_tls_cert','web_tls_key','web_tls_ca']:[])]:fs.readdirSync(file)};
  const code=fs.readFileSync(join(root,'scripts/postgres-image-probe.js'),'utf8').replace('http://127.0.0.1:3000',base).replace('(async()=>{','return (async()=>{');
  const state={env:{MANGER_PROBE_MODE:mode,MANGER_PROBE_HTTPS:secure?'1':'0'},getuid:()=>1000,exitCode:0};
  const fetcher=secure?tlsFetch(fs.readFileSync(join(folder,'tls/ca.crt'))):fetch;
  if(secure)await assert.rejects(tlsFetch(undefined)(base+'/api/health'),error=>['SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error.code));
  await Function('require','process','fetch',code)(name=>name==='node:fs'?mapped:name.startsWith('./')?require(join(root,name)):require(name),state,fetcher);
  assert.equal(state.exitCode,0,mode);
}

test('sondes image : HTTPS vérifié, archive récente, secours et HTTP sur vrais PostgreSQL natifs',{timeout:180000},async t=>{
  const folder=await mkdtemp(join(tmpdir(),'manger-image-recovery-'));
  t.after(()=>rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const sourceFolder=join(folder,'source'),sourceRuntime=join(folder,'source-runtime'),targetRuntime=join(folder,'target-runtime');
  for(const path of [sourceFolder,sourceRuntime,targetRuntime])await mkdir(path);
  await program('postgres-test-source.js',{MANGER_PROBE_SOURCE_DIR:sourceFolder});
  const source=await databaseFixture(t);
  await migratePostgres(source.migrationPool,await analyzeSource({home:join(sourceFolder,'manger.db'),accounts:join(sourceFolder,'accounts.db')}));
  const options={applicationRole:'manger_test_app',toolsDirectory:process.env.MANGER_TEST_PG_BIN||join(root,'.test-tools/postgresql-18.6-5/pgsql/bin')};
  const before=join(folder,'before'),recent=join(folder,'recent');
  assert.equal((await backupInstance(config(source),before,options)).status,'backed-up');
  const app=await runtime(t,source,sourceRuntime,{secure:true});
  await probe(app,'write',sourceRuntime);await probe(app,'verify',sourceRuntime);await app.close();
  await assert.rejects(verifyInstance(config(source),before,options),{code:'MANGER_INSTANCE_MISMATCH'});
  assert.equal((await backupInstance(config(source),recent,options)).status,'backed-up');
  const target=await postgresFixture(t),targetConfig=config(target),appConfig=config(target,false);
  await target.pool.end();await target.migrationPool.end();
  assert.equal((await restoreInstance(targetConfig,recent,{...options,trusted:true,targetEmpty:true,writersStopped:true})).status,'verified-closed');
  assert.equal((await verifyInstance(targetConfig,recent,options)).status,'verified-closed');
  await assert.rejects(openPostgres(appConfig),{code:'42501'});
  assert.equal((await openInstance(targetConfig,recent,{...options,writersStopped:true})).status,'ready');
  const recovered=await runtime(t,target,targetRuntime);
  await probe(recovered,'recovered',targetRuntime);await recovered.close();
  assert.equal((await verifyInstance(config(source),recent,options)).status,'verified-open');
});
