const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),{join,resolve}=require('node:path'),{tmpdir}=require('node:os'),{spawnSync,execFileSync}=require('node:child_process');
const bash=process.platform==='win32'?resolve(execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(),'../../../usr/bin/bash.exe'):'/bin/bash';
const posix=p=>process.platform==='win32'?p.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/'+drive.toLowerCase()):p;
const start='Mon 2026-11-02 11:11:28 CET',end='Mon 2026-11-02 11:11:29 CET',next='Tue 2026-11-03 03:00:00 CET';

for(const scenario of ['success','triggered','failed','timeout','stopped-timer','running','never-run','unconfirmed-exit','missing-unit','manager-error','missing-next','unknown-state'])test('backup status : '+scenario,async t=>{
  const root=await fs.mkdtemp(join(tmpdir(),'manger-auto-status-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const bin=join(root,'bin'),log=join(root,'calls.log');await fs.mkdir(bin);
  await fs.writeFile(join(bin,'uname'),'#!/bin/sh\necho Linux\n',{mode:0o700});
  await fs.writeFile(join(bin,'id'),'#!/bin/sh\necho 1000\n',{mode:0o700});
  const properties={LoadState:'loaded',ActiveState:'inactive',Result:'success',ExecMainCode:'1',ExecMainStatus:'0',ExecMainStartTimestamp:start,ExecMainExitTimestamp:end};
  const timer={LoadState:'loaded',ActiveState:'active',NextElapseUSecRealtime:next,LastTriggerUSec:''};
  if(scenario==='triggered'){
    properties.ExecMainExitTimestamp='Tue 2026-11-03 03:00:01 CET';
    timer.LastTriggerUSec='Tue 2026-11-03 03:00:00 CET';timer.NextElapseUSecRealtime='Wed 2026-11-04 03:00:00 CET';
  }
  if(scenario==='failed'){properties.ActiveState='failed';properties.Result='exit-code';properties.ExecMainStatus='1';}
  if(scenario==='timeout'){properties.ActiveState='failed';properties.Result='timeout';}
  if(scenario==='stopped-timer')timer.ActiveState='inactive';
  if(scenario==='running'){properties.ActiveState='activating';properties.ExecMainExitTimestamp='';}
  if(scenario==='never-run'){properties.ExecMainStartTimestamp='';properties.ExecMainExitTimestamp='';properties.ExecMainCode='0';}
  if(scenario==='unconfirmed-exit')properties.ExecMainCode='2';
  if(scenario==='missing-unit')properties.LoadState='not-found';
  if(scenario==='missing-next')timer.NextElapseUSecRealtime='';
  if(scenario==='unknown-state')properties.ActiveState='future-state';
  await fs.writeFile(join(root,'service.txt'),Object.entries(properties).map(([key,value])=>key+'='+value).join('\n')+'\n');
  await fs.writeFile(join(root,'timer.txt'),Object.entries(timer).map(([key,value])=>key+'='+value).join('\n')+'\n');
  await fs.writeFile(join(bin,'systemctl'),`#!/bin/sh
printf '%s\\n' "$*" >> "$STATUS_TEST_ROOT/calls.log"
[ "$STATUS_TEST_CASE" != manager-error ] || { echo 'private diagnostic' >&2; exit 47; }
case "$*" in
 *manger-postgres-backup.service) cat "$STATUS_TEST_ROOT/service.txt";;
 *manger-postgres-backup.timer) cat "$STATUS_TEST_ROOT/timer.txt";; *) exit 98;; esac
`,{mode:0o700});
  const result=spawnSync(bash,['scripts/status-postgres-backups.sh'],{encoding:'utf8',timeout:15000,
    env:{...process.env,PATH:posix(bin)+':/usr/bin:/bin:'+process.env.PATH,STATUS_TEST_ROOT:posix(root),STATUS_TEST_CASE:scenario}});
  const unavailable=['running','missing-unit','manager-error','unknown-state'].includes(scenario);
  assert.ifError(result.error);assert.equal(result.status,['success','triggered'].includes(scenario)?0:unavailable?2:1,result.stderr+'\n'+result.stdout);
  assert.equal(result.stdout.includes('Dernière exécution : réussie'),['success','triggered','stopped-timer','missing-next'].includes(scenario));
  assert.doesNotMatch(result.stdout+result.stderr,/private diagnostic/);
  const calls=await fs.readFile(log,'utf8');
  for(const call of calls.trim().split('\n'))assert.match(call,/^--user show --all --property=[A-Za-z,]+ manger-postgres-backup\.(service|timer)$/);
  if(scenario==='success'){
    assert.ok(result.stdout.includes(end));assert.ok(result.stdout.includes(next));
    assert.match(result.stdout,/Déclenchement du minuteur : aucun observé/);
    assert.match(result.stdout,/sans vérification des archives/);
  }
  if(scenario==='failed'||scenario==='timeout')assert.match(result.stdout,/Dernière exécution : échec/);
  if(scenario==='never-run')assert.match(result.stdout,/aucune réussite confirmée/);
  if(scenario==='triggered'){
    assert.match(result.stdout,/Déclenchement du minuteur : Tue 2026-11-03 03:00:00 CET/);
    assert.ok(result.stdout.includes('Wed 2026-11-04 03:00:00 CET'));
  }
});
