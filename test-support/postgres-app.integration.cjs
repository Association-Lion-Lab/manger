const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,writeFile,readFile,rm,readdir}=require('node:fs/promises');
const {join}=require('node:path'),{tmpdir}=require('node:os');
const {execFile,spawn}=require('node:child_process'),{promisify}=require('node:util');
const {databaseFixture}=require('./database');const {migrationSourceFixture}=require('./migration-source-fixture');
const {analyzeSource}=require('../migration-source');const {migratePostgres}=require('../migrate-postgres');
const {checkApplicationStorage}=require('../db/readiness');
const execute=promisify(execFile),root=join(__dirname,'..');
async function launched(t,env,cwd){
  const child=spawn(process.execPath,[join(root,'server.js')],{env,cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stderr.on('data',()=>{});
  let stopped=false;const stop=async()=>{if(stopped)return;stopped=true;if(child.exitCode!==null)return;await new Promise((resolve,reject)=>{let forced=false;const timer=setTimeout(()=>{forced=true;child.kill('SIGKILL');},12000);child.once('exit',(code,signal)=>{clearTimeout(timer);if(forced)reject(new Error('Arrêt forcé du candidat'));else if(process.platform!=='win32'&&(code!==0||signal))reject(new Error('Arrêt non propre'));else resolve();});child.kill('SIGTERM');});};t.after(stop);
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Démarrage candidat trop long')),10000);child.stdout.on('data',chunk=>{log+=chunk;const match=log.match(/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]));}});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Candidat arrêté avant écoute'));});child.once('error',reject);});
  return {port,stop};
}
test('candidat PostgreSQL : vrais lancements serveur et commandes locales',{timeout:120000},async t=>{
  const f=await databaseFixture(t),source=await analyzeSource(await migrationSourceFixture(t));await migratePostgres(f.migrationPool,source);
  const folder=await mkdtemp(join(tmpdir(),'manger-app-test-'));t.after(()=>rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const secret=join(folder,'application-password');await writeFile(secret,f.config.password,{mode:0o600,flag:'wx'});
  const env={...process.env,MANGER_STORAGE:'postgres',MANGER_POSTGRES_CANDIDATE:'1',MANGER_PG_HOST:'127.0.0.1',MANGER_PG_PORT:String(f.port),MANGER_PG_DATABASE:'manger_test',MANGER_PG_USER:'manger_test_app',MANGER_PG_PASSWORD_FILE:secret,MANGER_PG_TLS:'disable-local',MANGER_PORT:'0',MANGER_DB:join(folder,'forbidden.db'),MANGER_ACCOUNTS_DB:join(folder,'forbidden-accounts.db'),MANGER_DATA_DIR:join(folder,'runtime'),MANGER_TLS_CERT:'',MANGER_TLS_KEY:'',MANGER_TLS_CA:'',MANGER_SMTP_HOST:''};
  await t.test('accès et schémas prêts ; dérive ou état pending refusés avant écoute',async()=>{
    await checkApplicationStorage(f.database);
    await f.migrationPool.query("UPDATE manger_meta.data_import SET status='pending'");
    try{await assert.rejects(checkApplicationStorage(f.database));}finally{await f.migrationPool.query("UPDATE manger_meta.data_import SET status='ready'");}
    await f.migrationPool.query('CREATE TABLE public.drift(value integer)');
    try{await assert.rejects(execute(process.execPath,[join(root,'server.js')],{cwd:folder,env,windowsHide:true,timeout:10000}));}
    finally{await f.migrationPool.query('DROP TABLE public.drift');}
    for(const sql of ['GRANT CREATE,TEMPORARY ON DATABASE manger_test TO manger_test_app','GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO manger_test_app']){
      await f.testAsBootstrap(sql);
      try{await assert.rejects(checkApplicationStorage(f.database));}
      finally{await f.testAsBootstrap(sql.startsWith('GRANT CREATE')?'REVOKE CREATE,TEMPORARY ON DATABASE manger_test FROM manger_test_app':'REVOKE EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) FROM manger_test_app');}
    }
    const invalid={...env,MANGER_PORT:'65536',MANGER_PG_PORT:'1'};
    await assert.rejects(execute(process.execPath,[join(root,'server.js')],{cwd:folder,env:invalid,windowsHide:true,timeout:5000}),e=>e.code===1&&!e.killed);
  });
  await t.test('CLI PostgreSQL explicite, aucun fichier SQLite et vrai mot de passe généré',async()=>{
    const result=await execute(process.execPath,[join(root,'accounts.js'),'create-admin','equipe'],{cwd:folder,env,windowsHide:true,timeout:15000});
    assert.match(result.stdout,/Identifiant : equipe/);assert.ok((await f.database.query("SELECT admin,active FROM auth.accounts WHERE username='equipe'")).rows[0].admin);
    await assert.rejects(execute(process.execPath,[join(root,'accounts.js'),'create-admin','refus'],{cwd:folder,env:{...env,MANGER_POSTGRES_CANDIDATE:'0'},windowsHide:true,timeout:10000}));
    assert.equal((await readdir(folder)).some(n=>n.endsWith('.db')),false);
  });
  await t.test('serveur complet protégé, assets, sauvegarde/restauration et santé après coupure',async()=>{
    const app=await launched(t,env,folder),base=`http://127.0.0.1:${app.port}`;let cookie;
    const request=(path,method='GET',body,headers={})=>fetch(base+path,{method,signal:AbortSignal.timeout(10000),headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...headers},body});
    try{
      assert.equal((await request('/api/health')).status,200);assert.equal((await request('/api/recipes')).status,401);
      const login=await request('/api/account/login','POST',JSON.stringify({username:'admin',password:'long-password-admin'}),{'Content-Type':'application/json'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];await login.arrayBuffer();
      const page=await request('/');assert.equal(page.status,200);assert.match(await page.text(),/Ma cuisine, mes choix/);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
      for(const path of ['/icon.svg','/manifest.webmanifest','/tastes.js','/ui-icons.js']){const r=await request(path);assert.equal(r.status,200,path);await r.arrayBuffer();}
      for(const path of ['/api/recipes/export','/api/household','/api/week?start=2026-10-19','/api/shopping?start=2026-10-19']){const r=await request(path);assert.equal(r.status,200,path);await r.arrayBuffer();}
      const backup=await request('/api/backup','GET',undefined,{'X-Manger-Backup':'1'});assert.equal(backup.status,200);const bytes=Buffer.from(await backup.arrayBuffer());assert.equal(JSON.parse(bytes).format,'manger-household');
      const preview=await request('/api/restore/preview','POST',bytes,{'X-Manger-Restore':'1'});assert.equal(preview.status,200);const {token}=await preview.json();
      const restored=await request('/api/restore/apply','POST',JSON.stringify({token}),{'X-Manger-Restore':'1','Content-Type':'application/json'});assert.equal(restored.status,200);await restored.arrayBuffer();
      await f.stop();assert.equal((await request('/api/health')).status,503);await f.start();assert.equal((await request('/api/health')).status,200);
      assert.equal((await request('/missing')).status,404);
    }finally{await app.stop();}
  });
  await t.test('arrêt direct : requête HTTP suspendue fermée puis sessions du runtime retirées',async()=>{
    const ids=async()=>(await f.migrationPool.query("SELECT pid FROM pg_stat_activity WHERE application_name='manger' AND usename='manger_test_app'")).rows.map(r=>r.pid);
    const before=new Set(await ids()),runtime=await require('../postgres-app').createPostgresRuntime(env);await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));
    const own=(await ids()).filter(id=>!before.has(id));assert.ok(own.length);
    const {request}=require('node:http');let incoming;
    runtime.server.on('request',()=>incoming());const entered=new Promise(r=>incoming=r);
    const upload=request({host:'127.0.0.1',port:runtime.server.address().port,path:'/api/restore/preview',method:'POST',headers:{Host:`127.0.0.1:${runtime.server.address().port}`,Origin:`http://127.0.0.1:${runtime.server.address().port}`,Cookie:'manger_session='+'c'.repeat(64),'X-Manger-Restore':'1','Content-Length':1000}});
    upload.on('error',()=>{});upload.write('{');await entered;
    try{await runtime.close();await runtime.close();assert.equal(runtime.server.listening,false);const after=await ids();assert.ok(own.every(id=>!after.includes(id)));}
    finally{upload.destroy();await runtime.close();}
  });
  await t.test('HTTPS candidat : autorité vérifiée, cookie Secure et certificat public',async()=>{
    const destination=join(folder,'tls');require('../create-local-tls').createLocalTls('127.0.0.1',destination,process.env.OPENSSL||'openssl');
    const tlsEnv={...env,MANGER_TLS_CERT:join(destination,'server/server.crt'),MANGER_TLS_KEY:join(destination,'server/server.key'),MANGER_TLS_CA:join(destination,'ca.crt')};
    const ca=await readFile(tlsEnv.MANGER_TLS_CA),app=await launched(t,tlsEnv,folder),base=`https://127.0.0.1:${app.port}`;
    const request=(path,body,cookie)=>new Promise((resolveRequest,reject)=>{
      const method=body?'POST':'GET',req=require('node:https').request(base+path,{method,ca,timeout:8000,headers:{Origin:base,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolveRequest({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});
      req.on('timeout',()=>req.destroy(new Error('HTTPS timeout')));req.on('error',reject);req.end(body);
    });
    try{
      await require('../healthcheck').healthcheck({...tlsEnv,MANGER_PORT:String(app.port)});
      await assert.rejects(require('../healthcheck').healthcheck({MANGER_TLS_CERT:tlsEnv.MANGER_TLS_CERT,MANGER_TLS_KEY:tlsEnv.MANGER_TLS_KEY,MANGER_PORT:String(app.port)}));
      const login=await request('/api/account/login',JSON.stringify({username:'admin',password:'long-password-admin'}));assert.equal(login.status,200);assert.match(login.headers['set-cookie'][0],/; Secure/);
      const cert=await request('/api/accounts/certificate',null,login.headers['set-cookie'][0].split(';')[0]);assert.equal(cert.status,200);assert.equal(cert.headers['content-type'],'application/pkix-cert');assert.equal(new(require('node:crypto').X509Certificate)(cert.body).ca,true);
      await app.stop();
      const runtime=await require('../postgres-app').createPostgresRuntime(tlsEnv);await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));
      const connected=new Promise(r=>runtime.server.once('connection',r)),raw=require('node:net').connect(runtime.server.address().port,'127.0.0.1');raw.on('error',()=>{});await connected;
      const closing=runtime.close();let timer;
      try{await Promise.race([closing,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('TCP sans ClientHello bloque la fermeture')),7000);})]);}
      finally{clearTimeout(timer);raw.destroy();await closing;}
    }finally{await app.stop();}
  });
  await t.test('arrêt du processus pendant SMTP silencieux : aucun transport restant',async()=>{
    const sockets=new Set();let entered;const waiting=new Promise(r=>entered=r),smtp=require('node:net').createServer(socket=>{sockets.add(socket);socket.on('error',error=>assert.equal(error.code,'ECONNRESET'));socket.once('close',()=>sockets.delete(socket));entered();});
    let smtpClosing;const closeSmtp=()=>smtpClosing||=(async()=>{for(const socket of sockets)socket.destroy();if(smtp.listening)await new Promise(r=>smtp.close(r));})();t.after(closeSmtp);
    await new Promise(r=>smtp.listen(0,'127.0.0.1',r));
    const app=await launched(t,{...env,MANGER_SMTP_HOST:'127.0.0.1',MANGER_SMTP_PORT:String(smtp.address().port),MANGER_SMTP_FROM:'admin@example.test',MANGER_APP_URL:'http://127.0.0.1:1'},folder),base=`http://127.0.0.1:${app.port}`;
    const request=(path,data)=>fetch(base+path,{method:'POST',signal:AbortSignal.timeout(15000),headers:{Origin:base,Cookie:'manger_session='+'c'.repeat(64),'Content-Type':'application/json'},body:JSON.stringify(data)});
    let pending;
    try{
      const invitation=await request('/api/accounts/invitation',{});assert.equal(invitation.status,201);const {token}=await invitation.json();
      pending=request('/api/accounts/invitation/email',{to:'invite@example.test',token}).catch(()=>null);let timer;
      try{await Promise.race([waiting,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SMTP de test non contacté')),5000);})]);}finally{clearTimeout(timer);}
      await app.stop();await pending;
      for(let i=0;i<20&&sockets.size;i++)await new Promise(r=>setTimeout(r,25));assert.equal(sockets.size,0);
    }finally{await app.stop();await closeSmtp();await pending;}
  });
  assert.equal((await readdir(folder)).some(n=>n.endsWith('.db')),false);
});
