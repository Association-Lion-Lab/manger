const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,writeFile,mkdir,copyFile,readFile,rm}=require('node:fs/promises');
const {join,resolve}=require('node:path'),{tmpdir}=require('node:os');
const {execFileSync,spawn}=require('node:child_process');
const bash=process.platform==='win32'?resolve(execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(),'../../../usr/bin/bash.exe'):'/bin/bash';
const posix=path=>process.platform==='win32'?path.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/'+drive.toLowerCase()):path;

const docker=`#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$PRIVATE_TEST_LOG"
case "$1" in
 info) echo linux;;
 image) exit 0;;
 volume|network) if [ "$PRIVATE_TEST_CASE" = listing-fail ]; then exit 47; fi; if [ "$PRIVATE_TEST_CASE" = existing ]; then echo manger-postgres-validation_postgres-data; fi;;
 ps) if [ "$PRIVATE_TEST_CASE" = ps-fail ]; then exit 47; fi; exit 0;;
 inspect)
 case "$*" in
 *'.Config.Env'*) if [ "$PRIVATE_TEST_CASE" = wrong-source ]; then echo MANGER_STORAGE=postgres; else echo MANGER_STORAGE=sqlite; fi;;
 *'.Config.Labels'*) echo manger;;
 *'.State.Running'*) if [ "$PRIVATE_TEST_CASE" = stopped ]; then echo false; else echo true; fi;;
 *'.Image'*) echo sha256:synthetic-source;;
 *) echo source-container-id;; esac;;
 start) if [ "$PRIVATE_TEST_CASE" = restart-fail ]; then exit 47; fi;;
 exec) if [ "$PRIVATE_TEST_CASE" = health-fail ]; then exit 47; fi;;
 stop) exit 0;;
 cp)
 if [ "$PRIVATE_TEST_CASE" = copy-fail ]; then exit 47; fi
 if [ "$PRIVATE_TEST_CASE" = interrupted ]; then kill -TERM "$PPID"; exit 0; fi
 dest=''; for arg in "$@"; do dest=$arg; done
 printf 'synthetic household' > "$dest/manger.db"
 printf 'synthetic accounts' > "$dest/accounts.db";;
 run) echo '{"counts":{},"fingerprints":[]}' ;;
 compose)
 case "$*" in
 *' migrate import '*) if [ "$PRIVATE_TEST_CASE" = import-fail ]; then exit 47; fi; echo '{"status":"ready","tables":22}';;
 *' instance backup '*) if [ "$PRIVATE_TEST_CASE" = backup-fail ]; then exit 47; fi; echo '{"status":"backed-up","tables":22}';;
 *' instance verify '*) if [ "$PRIVATE_TEST_CASE" = verify-fail ]; then exit 47; fi; echo '{"status":"verified-open","tables":22}';;
 *' port app '*) echo 127.0.0.1:54321;;
 *) exit 0;; esac;;
 *) exit 98;; esac
`;
const openssl=`#!/bin/bash
set -eu
if [ "$1" = rand ]; then
 n=1; [ ! -f "$PRIVATE_TEST_COUNTER" ] || n=$(( $(cat "$PRIVATE_TEST_COUNTER") + 1 )); echo "$n" > "$PRIVATE_TEST_COUNTER"; printf '%064d\\n' "$n"; exit
fi
while [ "$#" -gt 0 ]; do
 case "$1" in -out|-keyout) shift; printf synthetic > "$1";; esac
 shift
done
`;

const exitCodes={success:0,'copy-fail':47,'import-fail':47,'backup-fail':47,'verify-fail':47,existing:1,stopped:0,interrupted:143,'listing-fail':47,'ps-fail':47,'wrong-source':1,'restart-fail':1,'health-fail':1};
for(const [scenario,expected] of Object.entries(exitCodes))test('répétition privée simulée : '+scenario,{timeout:45000},async t=>{
  const parent=await mkdtemp(join(tmpdir(),'manger-private-command-'));
  t.after(()=>rm(parent,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const repo=join(parent,'manger'),bin=join(parent,'fake-bin'),log=join(parent,'calls.log');
  await mkdir(join(repo,'scripts'),{recursive:true});await mkdir(join(repo,'tls/server'),{recursive:true});await mkdir(bin);
  await copyFile('scripts/rehearse-private-postgres.sh',join(repo,'scripts/rehearse-private-postgres.sh'));
  for(const name of ['server.crt','server.key','ca.crt'])await writeFile(join(repo,'tls/server',name),'synthetic original '+name);
  await writeFile(join(repo,'compose.yaml'),'synthetic original compose');
  await writeFile(join(bin,'docker'),docker,{mode:0o700});await writeFile(join(bin,'openssl'),openssl,{mode:0o700});
  await writeFile(join(bin,'uname'),'#!/bin/sh\necho Linux\n',{mode:0o700});
  await writeFile(join(bin,'sleep'),'#!/bin/sh\nexit 0\n',{mode:0o700});
  const env={...process.env,PATH:posix(bin)+':/usr/bin:/bin:'+process.env.PATH,PRIVATE_TEST_CASE:scenario,PRIVATE_TEST_LOG:posix(log),PRIVATE_TEST_COUNTER:posix(join(parent,'counter'))};
  const child=spawn(bash,['scripts/rehearse-private-postgres.sh','manger:synthetic','manger:synthetic-tools'],{cwd:repo,env,stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  const calls=await readFile(log,'utf8');
  assert.equal(result,expected,output);
  const started=calls.split('\n').filter(line=>line.startsWith('start '));
  assert.equal(started.length,['existing','stopped','listing-fail','ps-fail','wrong-source'].includes(scenario)?0:['restart-fail','health-fail'].includes(scenario)?2:1,calls);
  const success=['success','stopped'].includes(scenario);
  assert.equal(calls.includes('migrate import'),success||['import-fail','backup-fail','verify-fail'].includes(scenario),calls);
  assert.equal(output.includes('Répétition privée terminée'),success,output);
  assert.doesNotMatch(calls,/down|prune|reset-password|create-admin|--build/);
  assert.equal(calls.includes('instance backup'),success||['backup-fail','verify-fail'].includes(scenario),calls);
  assert.equal(calls.includes('up -d --no-build --wait --wait-timeout 90 app'),success,calls);
  if(scenario==='ps-fail')assert.doesNotMatch(calls,/^stop |^compose /m);
  if(['restart-fail','health-fail'].includes(scenario))assert.match(output,/Reprise SQLite non confirmée/);
  assert.equal(await readFile(join(repo,'tls/server/server.key'),'utf8'),'synthetic original server.key');
  assert.equal(await readFile(join(repo,'compose.yaml'),'utf8'),'synthetic original compose');
});
