const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,mkdir,writeFile,copyFile,readFile,rm}=require('node:fs/promises');
const {join,resolve,dirname,basename}=require('node:path'),{tmpdir}=require('node:os');
const {spawnSync,execFileSync}=require('node:child_process');
const bash=process.platform==='win32'?resolve(execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(),'../../../usr/bin/bash.exe'):'/bin/bash';
const posix=value=>process.platform==='win32'?value.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/'+drive.toLowerCase()):value;
const docker=`#!/bin/bash
set -eu
printf 'image=%s %s\\n' "\${MANGER_POSTGRES_TOOLS_IMAGE:-env}" "$*" >> "$FDL_UPGRADE_LOG"
case "$1" in
 inspect) case "$*" in
  *'.Config.Labels'*project*) echo manger-postgres-validation;;
  *'.Config.Labels'*service*) echo app;;
  *'.Config.Env'*) echo MANGER_STORAGE=postgres;;
  *'.State.Running'*) echo true;;
  *'.Image'*) echo old-app-id;; *) exit 98;; esac;;
 image) echo old-tools-id;;
 build) [ "$FDL_UPGRADE_CASE" != build-fail ] || exit 47;;
 run) case "$*" in
  *old-tools-id*) [ "$FDL_UPGRADE_CASE" = current4 ] && echo 4 || echo 3;;
  *'MANGER_FDL_URL='*) [ "$FDL_UPGRADE_CASE" != url-fail ] || exit 47;;
  *) echo 4;; esac;;
 compose) case "$*" in
  *'config --quiet'*) :;;
  *'ps --all --quiet app'*) echo app-id;;
  *storage_status*) cat "$FDL_UPGRADE_SCHEMA";;
  *'instance postgres-schema.js --apply'*) [ "$FDL_UPGRADE_CASE" != migration-fail ] || exit 47; echo 4 > "$FDL_UPGRADE_SCHEMA"; echo '{"version":4,"applied":[4]}';;
  *'instance backup /archives/before-fdl-'*) [ "$FDL_UPGRADE_CASE" != backup-fail ] || exit 47; echo '{"status":"backed-up"}';;
  *'instance verify /archives/before-fdl-'*) [ "$FDL_UPGRADE_CASE" != verify-fail ] || exit 47; echo '{"status":"verified-open"}';;
  *'instance backup /archives/after-fdl-'*) [ "$FDL_UPGRADE_CASE" != after-fail ] || exit 47; echo '{"status":"backed-up","tables":25}';;
  *'instance verify /archives/after-fdl-'*) [ "$FDL_UPGRADE_CASE" != after-verify-fail ] || exit 47; echo '{"status":"verified-open","tables":25}';;
  *'exec -T app node healthcheck.js'*) [ "$FDL_UPGRADE_CASE" != health-fail ] || exit 47;;
  *'stop app'*|*'start app'*|*'up -d '*|*' ps'*) :;;
  *) exit 98;; esac;;
 *) exit 98;; esac
`;
for(const scenario of ['success','current4','resume4','inactive','backup-running','build-fail','backup-fail','verify-fail','migration-fail','after-fail','after-verify-fail','health-fail','auto-fail','lock-busy','url-fail']){
  test('migration FDL simulée : '+scenario,{timeout:30000},async t=>{
    const parent=await mkdtemp(join(tmpdir(),'manger-fdl-command-'));
    t.after(async()=>{assert.equal(dirname(parent),resolve(tmpdir()));assert.ok(basename(parent).startsWith('manger-fdl-command-'));await rm(parent,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
    const repo=join(parent,'manger'),privateDir=join(parent,'manger-postgres-validation-private'),bin=join(parent,'bin'),log=join(parent,'calls.log'),schema=join(parent,'schema');
    await mkdir(join(repo,'scripts'),{recursive:true});await mkdir(join(privateDir,'promotion'),{recursive:true});await mkdir(bin);
    await copyFile('scripts/upgrade-postgres-fdl.sh',join(repo,'scripts/upgrade-postgres-fdl.sh'));
    await writeFile(join(repo,'scripts/test-docker.sh'),'#!/bin/sh\nexit 0\n');
    await writeFile(join(privateDir,'promotion/state.txt'),'postgres-lan\n');
    const original='MANGER_CANDIDATE_IMAGE=manger:old\nMANGER_POSTGRES_TOOLS_IMAGE=manger:old-tools\nMANGER_SMTP_PASSWORD=private-fixture-not-to-print\n';
    await writeFile(join(privateDir,'instance.env'),original);await writeFile(schema,['current4','resume4'].includes(scenario)?'4\n':'3\n');
    await writeFile(join(bin,'docker'),docker,{mode:0o700});
    await writeFile(join(bin,'uname'),'#!/bin/sh\necho Linux\n',{mode:0o700});await writeFile(join(bin,'id'),'#!/bin/sh\necho 1000\n',{mode:0o700});
    await writeFile(join(bin,'git'),'#!/bin/sh\ncase "$*" in rev-parse*) echo 3491e9fabcde;; diff*) exit 0;; *) exit 98;; esac\n',{mode:0o700});
    await writeFile(join(bin,'flock'),'#!/bin/sh\n[ "$FDL_UPGRADE_CASE" != lock-busy ]\n',{mode:0o700});
    await writeFile(join(bin,'sleep'),'#!/bin/sh\nexit 0\n',{mode:0o700});
    await writeFile(join(bin,'systemctl'),`#!/bin/bash
printf 'systemctl %s\\n' "$*" >> "$FDL_UPGRADE_LOG"
case "$*" in
 *LoadState*) echo loaded;;
 *ActiveState*) if [ "$FDL_UPGRADE_CASE" = backup-running ] && [ ! -f "$FDL_UPGRADE_SCHEMA.waited" ]; then touch "$FDL_UPGRADE_SCHEMA.waited"; echo activating; else echo inactive; fi;;
 *is-active*timer*) [ "$FDL_UPGRADE_CASE" != inactive ];;
 *is-active*service*) exit 3;;
 *'start manger-postgres-backup.service'*) [ "$FDL_UPGRADE_CASE" != auto-fail ] || exit 47;;
 *) :;; esac
`,{mode:0o700});
    const args=['scripts/upgrade-postgres-fdl.sh',...(['success','url-fail'].includes(scenario)?['--fdl-url','https://fdl.example']:[])];
    const result=spawnSync(bash,args,{cwd:repo,encoding:'utf8',timeout:20000,env:{...process.env,PATH:posix(bin)+':/usr/bin:/bin:'+process.env.PATH,FDL_UPGRADE_LOG:posix(log),FDL_UPGRADE_SCHEMA:posix(schema),FDL_UPGRADE_CASE:scenario,MANGER_POSTGRES_TOOLS_IMAGE:'wrong:ambient'}});
    assert.ifError(result.error);const calls=await readFile(log,'utf8').catch(()=>''),config=await readFile(join(privateDir,'instance.env'),'utf8');
    const success=['success','current4','resume4','inactive','backup-running'].includes(scenario);assert.equal(result.status===0,success,result.stderr+'\n'+calls);
    assert.doesNotMatch(result.stdout+result.stderr,/private-fixture-not-to-print/);assert.doesNotMatch(calls,/wrong:ambient|down|prune|migrate-postgres\.js import/);
    const before=calls.indexOf('instance backup /archives/before-fdl-'),migration=calls.indexOf('instance postgres-schema.js --apply'),after=calls.indexOf('instance backup /archives/after-fdl-'),start=calls.indexOf('up -d');
    if(success){assert.ok(before>=0&&before<migration&&migration<after&&after<start,calls);assert.match(config,/MANGER_CANDIDATE_IMAGE=manger:fdl-3491e9fabcde/);assert.match(config,/MANGER_POSTGRES_TOOLS_IMAGE=manger:fdl-3491e9fabcde-tools/);assert.ok(config.includes('private-fixture-not-to-print'));
      assert.equal(calls.includes('systemctl --user start manger-postgres-backup.timer'),scenario!=='inactive');
      if(scenario==='success')assert.match(config,/MANGER_FDL_URL=https:\/\/fdl\.example/);
    }else if(['build-fail','backup-fail','verify-fail','url-fail','lock-busy'].includes(scenario)){assert.equal(config,original);assert.equal(migration,-1);}
    if(['migration-fail','after-fail','after-verify-fail','health-fail','auto-fail'].includes(scenario)){assert.ok(!calls.includes(' start app'));assert.ok(!calls.includes('systemctl --user start manger-postgres-backup.timer'));assert.match(result.stderr,/Minuteur laissé arrêté/);}
    if(scenario==='backup-running')assert.equal(calls.match(/systemctl --user show --property=ActiveState/g)?.length,2);
    if(['backup-fail','verify-fail'].includes(scenario))assert.ok(calls.includes(' start app'));
  });
}
