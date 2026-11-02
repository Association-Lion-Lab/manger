const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,mkdir,writeFile,readFile,copyFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os'),{join,resolve}=require('node:path'),{spawnSync,execFileSync}=require('node:child_process');
const bash=process.platform==='win32'?resolve(execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(),'../../../usr/bin/bash.exe'):'/bin/bash';
const posix=value=>process.platform==='win32'?value.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/'+drive.toLowerCase()):value;
for(const scenario of ['success','config-fail','backup-fail','not-promoted'])test('daily backup host wrapper : '+scenario,async t=>{
  const root=await mkdtemp(join(tmpdir(),'manger-auto-shell-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const repo=join(root,'manger'),privateDir=join(root,'manger-postgres-validation-private'),bin=join(root,'bin'),log=join(root,'calls.log');
  await mkdir(join(repo,'scripts'),{recursive:true});await mkdir(join(privateDir,'promotion'),{recursive:true});await mkdir(bin);
  await mkdir(join(privateDir,'archives'));await mkdir(join(privateDir,'secrets'));
  await copyFile('scripts/backup-postgres.sh',join(repo,'scripts/backup-postgres.sh'));
  await writeFile(join(repo,'postgres-auto-backup.js'),'synthetic worker');
  await writeFile(join(privateDir,'instance.env'),'MANGER_POSTGRES_TOOLS_IMAGE=manger:synthetic-tools\nMANGER_PG_SECRETS_DIR=wrong\nMANGER_PG_SOURCE_DIR=wrong\nMANGER_PG_ARCHIVE_DIR=wrong\nMANGER_WEB_TLS_DIR=wrong\n');
  await writeFile(join(privateDir,'promotion/state.txt'),scenario==='not-promoted'?'wrong\n':'postgres-lan\n');
  await writeFile(join(bin,'uname'),'#!/bin/sh\necho Linux\n',{mode:0o700});
  await writeFile(join(bin,'docker'),`#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$AUTO_SHELL_LOG"
[[ "\$MANGER_PG_ARCHIVE_DIR" -ef "$AUTO_EXPECT_PRIVATE/archives" ]]
[[ "\$MANGER_PG_SECRETS_DIR" -ef "$AUTO_EXPECT_PRIVATE/secrets" ]]
[[ -z "\${MANGER_POSTGRES_TOOLS_IMAGE+x}" ]]
case "$*" in
 *'config --quiet'*) [[ "$AUTO_SHELL_CASE" != config-fail ]] || exit 47;;
 *'run --rm'*) [[ "$AUTO_SHELL_CASE" != backup-fail ]] || exit 47; echo 'synthetic success';;
 *) exit 98;; esac
`,{mode:0o700});
  const child=spawnSync(bash,['scripts/backup-postgres.sh'],{cwd:repo,encoding:'utf8',timeout:15000,env:{...process.env,
    PATH:posix(bin)+':/usr/bin:/bin:'+process.env.PATH,AUTO_SHELL_LOG:posix(log),AUTO_EXPECT_PRIVATE:posix(privateDir),AUTO_SHELL_CASE:scenario,
    MANGER_POSTGRES_TOOLS_IMAGE:'wrong:ambient',MANGER_PG_ARCHIVE_DIR:'wrong:ambient',MANGER_PG_SECRETS_DIR:'wrong:ambient'}});
  const calls=await readFile(log,'utf8').catch(()=> '');
  assert.ifError(child.error);assert.equal(child.status,scenario==='success'?0:scenario==='not-promoted'?1:47,child.stderr+'\n'+calls);
  assert.doesNotMatch(calls,/\bstop\b|\bstart\b|\bup\b|\bdown\b|\bbuild\b|\bprune\b|migrate import|reset-password/);
  assert.equal(calls.includes('run --rm'),['success','backup-fail'].includes(scenario),calls);
  if(scenario==='success'){
    for(const text of ['--project-name manger-postgres-validation','--no-deps','--pull never','--name manger-postgres-auto-backup',
      '--label org.manger.operation=automatic-backup','--entrypoint node','instance /app/postgres-auto-backup.js',':/app/postgres-auto-backup.js:ro'])assert.ok(calls.includes(text),text);
  }
});

test('daily user timer is persistent, scheduled in Paris and contains no secrets',async()=>{
  const timer=await readFile('deploy/systemd/manger-postgres-backup.timer','utf8');
  const service=await readFile('deploy/systemd/manger-postgres-backup.service','utf8');
  assert.match(timer,/OnCalendar=\*-\*-\* 03:00:00 Europe\/Paris/);assert.match(timer,/Persistent=true/);
  assert.match(timer,/WantedBy=timers.target/);assert.match(service,/Type=oneshot/);assert.match(service,/UMask=0077/);
  assert.match(service,/ExecStart=\/bin\/bash %h\/services\/manger\/scripts\/backup-postgres.sh/);
  assert.doesNotMatch(service+timer,/password|secret|EnvironmentFile|RemainAfterExit=true|Restart=/i);
});

for(const scenario of ['success','active','running','docker-fail','foreign-project','invalid-lock'])test('documented automatic lock recovery : '+scenario,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'manger-auto-unlock-'));t.after(()=>rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const home=join(directory,'home'),root=join(home,'services/manger-postgres-validation-private/archives/automatic');
  const bin=join(directory,'bin'),log=join(directory,'calls.log');
  await mkdir(root,{recursive:true});await mkdir(bin);
  await writeFile(join(root,'.owner.json'),JSON.stringify({instance:'manger-postgres-validation'}));
  await writeFile(join(root,'.lock'),scenario==='invalid-lock'?'unexpected':'a'.repeat(32));
  await writeFile(join(root,'keep-private.txt'),'keep');
  const record='printf "%s\\n" "$*" >> "$UNLOCK_TEST_LOG"\n';
  await writeFile(join(bin,'systemctl'),'#!/bin/sh\n'+record+'case "$*" in *"ActiveState"*) if [ "$UNLOCK_TEST_CASE" = active ]; then echo active; else echo inactive; fi;; esac\n',{mode:0o700});
  await writeFile(join(bin,'docker'),`#!/bin/sh
${record}case "$1" in
 ps) [ "$UNLOCK_TEST_CASE" != docker-fail ] || exit 47; echo synthetic-worker;;
 inspect) case "$*" in
  *State.Running*) if [ "$UNLOCK_TEST_CASE" = running ]; then echo true; else echo false; fi;;
  *com.docker.compose.project*) if [ "$UNLOCK_TEST_CASE" = foreign-project ]; then echo other; else echo manger-postgres-validation; fi;;
  *org.manger.operation*) echo automatic-backup;; *) exit 98;; esac;;
 rm) [ "$*" = 'rm synthetic-worker' ] || exit 98;; *) exit 98;; esac
`,{mode:0o700});
  const doc=await readFile('docs/POSTGRESQL-AUTO-BACKUPS.md','utf8');
  const block=doc.match(/<!-- shell:auto-backup-unlock -->\s*```sh\r?\n([\s\S]*?)```/);assert.ok(block);
  const child=spawnSync(bash,['-c',block[1]],{encoding:'utf8',timeout:15000,env:{...process.env,HOME:posix(home),
    PATH:posix(bin)+':/usr/bin:/bin:'+process.env.PATH,UNLOCK_TEST_LOG:posix(log),UNLOCK_TEST_CASE:scenario}});
  assert.ifError(child.error);assert.equal(child.status,scenario==='success'?0:scenario==='docker-fail'?47:1,child.stderr);
  const remaining=await readFile(join(root,'.lock'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  assert.equal(remaining===null,scenario==='success');assert.equal(await readFile(join(root,'keep-private.txt'),'utf8'),'keep');
  const calls=await readFile(log,'utf8');
  assert.equal(calls.includes('rm synthetic-worker'),['success','invalid-lock'].includes(scenario),calls);
  assert.doesNotMatch(calls,/\bdown\b|\bprune\b|\bstop app\b|rm -v/);
});
