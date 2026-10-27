const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,writeFile,mkdir,copyFile,readFile,rm}=require('node:fs/promises');
const {join,resolve}=require('node:path'),{tmpdir}=require('node:os');
const {execFileSync,spawn}=require('node:child_process');
const bash=process.platform==='win32'?resolve(execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(),'../../../usr/bin/bash.exe'):'/bin/bash';
const posix=path=>process.platform==='win32'?path.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/'+drive.toLowerCase()):path;
const docker=`#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$PROMOTION_TEST_LOG"
case "$1" in
 info) echo linux;;
 inspect) case "$*" in
 *'.Id'*) if [ "$PROMOTION_TEST_CASE" = source-changed ]; then echo another-source; else echo source-id; fi;;
 *'.Config.Labels'*) echo manger;;
 *'.Config.Env'*) if [ "$PROMOTION_TEST_CASE" = wrong-source ]; then echo MANGER_STORAGE=postgres; else echo MANGER_STORAGE=sqlite; fi;;
 *'.State.Running'*) [ -f "$PROMOTION_TEST_STOPPED" ] && echo false || echo true;;
 *) exit 98;; esac;;
 stop) if [ "$PROMOTION_TEST_CASE" = source-stop-fail ]; then exit 47; fi; touch "$PROMOTION_TEST_STOPPED";;
 compose) case "$*" in
 *' stop app'*) if [ "$PROMOTION_TEST_CASE" = app-stop-fail ]; then exit 47; fi;;
 *' instance backup '*) if [ "$PROMOTION_TEST_CASE" = backup-fail ]; then exit 47; fi; echo '{"status":"backed-up","tables":22}';;
 *' instance verify '*) if [ "$PROMOTION_TEST_CASE" = verify-fail ]; then exit 47; fi; echo '{"status":"verified-open","tables":22}';;
 *' config --quiet'*) if [ "$PROMOTION_TEST_CASE" = config-fail ]; then exit 47; fi;;
 *' up -d '*) if [ "$PROMOTION_TEST_CASE" = start-fail ]; then exit 47; fi; if [ "$PROMOTION_TEST_CASE" = interrupted ]; then kill -TERM "$PPID"; fi;;
 *' exec -T app node healthcheck.js'*) if [ "$PROMOTION_TEST_CASE" = health-fail ] && [ -f "$PROMOTION_TEST_STOPPED" ]; then exit 47; fi;;
 *' ps'*) echo synthetic-healthy;;
 *) exit 98;; esac;;
 *) exit 98;; esac
`;
const outcomes={success:0,'source-changed':1,'wrong-source':1,'certificate-fail':47,'not-local':1,'already-promoted':1,'app-stop-fail':47,'backup-fail':47,'verify-fail':47,'config-fail':47,'source-stop-fail':47,'start-fail':47,'health-fail':47,interrupted:143};

for(const [scenario,expected] of Object.entries(outcomes))test('bascule de données de test simulée : '+scenario,{timeout:30000},async t=>{
  const parent=await mkdtemp(join(tmpdir(),'manger-promotion-command-'));
  t.after(()=>rm(parent,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const repo=join(parent,'manger'),privateDir=join(parent,'manger-postgres-validation-private'),bin=join(parent,'fake-bin'),log=join(parent,'calls.log');
  await mkdir(join(repo,'scripts'),{recursive:true});await mkdir(join(repo,'tls/server'),{recursive:true});await mkdir(bin);
  await mkdir(join(privateDir,'original'),{recursive:true});await mkdir(join(privateDir,'archives'));
  await copyFile('scripts/promote-postgres-test-instance.sh',join(repo,'scripts/promote-postgres-test-instance.sh'));
  await writeFile(join(privateDir,'original/container-id.txt'),'source-id\n');
  const original='MANGER_INSTANCE_BIND_ADDRESS=127.0.0.1\nMANGER_INSTANCE_PORT=0\nMANGER_APP_URL=\nMANGER_SMTP_HOST=\nMANGER_SMTP_PASSWORD=\n';
  await writeFile(join(privateDir,'instance.env'),original);
  for(const name of ['server.crt','server.key','ca.crt'])await writeFile(join(repo,'tls/server',name),'synthetic original '+name);
  if(scenario==='already-promoted')await mkdir(join(privateDir,'promotion'));
  await writeFile(join(bin,'docker'),docker,{mode:0o700});
  await writeFile(join(bin,'openssl'),'#!/bin/bash\n[ "$PROMOTION_TEST_CASE" != certificate-fail ] || exit 47\n',{mode:0o700});
  await writeFile(join(bin,'uname'),'#!/bin/sh\necho Linux\n',{mode:0o700});
  await writeFile(join(bin,'ip'),'#!/bin/bash\n[ "$PROMOTION_TEST_CASE" = not-local ] || echo "2: eno1 inet 192.168.1.31/24 scope global eno1"\nexit 0\n',{mode:0o700});
  const env={...process.env,PATH:posix(bin)+':/usr/bin:/bin:'+process.env.PATH,PROMOTION_TEST_CASE:scenario,PROMOTION_TEST_LOG:posix(log),PROMOTION_TEST_STOPPED:posix(join(parent,'stopped'))};
  const child=spawn(bash,['scripts/promote-postgres-test-instance.sh','192.168.1.31','--test-data-only'],{cwd:repo,env,stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  const calls=await readFile(log,'utf8');assert.equal(result,expected,output);
  assert.doesNotMatch(calls,/down|prune|reset-password|create-admin|migrate import|--build|^start /m);
  const reachedSource=['success','source-stop-fail','start-fail','health-fail','interrupted'].includes(scenario);
  assert.equal(calls.includes('stop source-id'),reachedSource,calls);
  assert.equal(calls.includes('up -d'),['success','start-fail','health-fail','interrupted'].includes(scenario),calls);
  const settings=await readFile(join(privateDir,'instance.env'),'utf8');
  if(['success','start-fail','health-fail','interrupted'].includes(scenario)){
    assert.match(settings,/MANGER_INSTANCE_BIND_ADDRESS=192\.168\.1\.31\n/);assert.match(settings,/MANGER_INSTANCE_PORT=3000\n/);
    assert.equal(await readFile(join(privateDir,'promotion/instance.before.env'),'utf8'),original);
    assert.ok(calls.indexOf('instance backup')<calls.indexOf('stop source-id'));
    assert.ok(calls.indexOf('stop source-id')<calls.indexOf('up -d'));
  }else assert.equal(settings,original);
  assert.equal(output.includes('PostgreSQL disponible'),scenario==='success',output);
  assert.equal(await readFile(join(repo,'tls/server/server.key'),'utf8'),'synthetic original server.key');
});
