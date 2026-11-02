const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),{join,resolve}=require('node:path'),{tmpdir}=require('node:os'),{spawnSync,execFileSync}=require('node:child_process');
const bash=process.platform==='win32'?resolve(execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(),'../../../usr/bin/bash.exe'):'/bin/bash';
const posix=p=>process.platform==='win32'?p.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,drive)=>'/'+drive.toLowerCase()):p;
for(const scenario of ['success','backup-fail','linger-fail','service-fail','enable-fail','timer-inactive','existing'])test('user timer installer : '+scenario,async t=>{
  const root=await fs.mkdtemp(join(tmpdir(),'manger-auto-install-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const home=join(root,'home'),repo=join(home,'services/manger'),bin=join(root,'bin'),log=join(root,'calls.log'),unitDir=join(home,'.config/systemd/user');
  await fs.mkdir(join(repo,'scripts'),{recursive:true});await fs.mkdir(join(repo,'deploy/systemd'),{recursive:true});await fs.mkdir(bin);
  await fs.copyFile('scripts/install-postgres-backups.sh',join(repo,'scripts/install-postgres-backups.sh'));
  for(const suffix of ['service','timer'])await fs.copyFile('deploy/systemd/manger-postgres-backup.'+suffix,join(repo,'deploy/systemd/manger-postgres-backup.'+suffix));
  if(scenario==='existing'){await fs.mkdir(unitDir,{recursive:true});await fs.writeFile(join(unitDir,'manger-postgres-backup.service'),'keep original');}
  const record='printf "%s\\n" "$*" >> "$INSTALL_TEST_LOG"\n';
  await fs.writeFile(join(repo,'scripts/backup-postgres.sh'),'#!/bin/bash\necho backup >> "$INSTALL_TEST_LOG"\n[ "$INSTALL_TEST_CASE" != backup-fail ] || exit 47\n',{mode:0o700});
  await fs.writeFile(join(bin,'uname'),'#!/bin/sh\necho Linux\n',{mode:0o700});
  await fs.writeFile(join(bin,'id'),'#!/bin/sh\ncase "$1" in -u) echo 1000;; -un) echo synthetic-admin;; esac\n',{mode:0o700});
  await fs.writeFile(join(bin,'systemd-analyze'),'#!/bin/sh\n'+record,{mode:0o700});
  await fs.writeFile(join(bin,'sudo'),'#!/bin/sh\n'+record+'[ "$INSTALL_TEST_CASE" != linger-fail ] || exit 47\n',{mode:0o700});
  await fs.writeFile(join(bin,'systemctl'),'#!/bin/sh\n'+record+'case "$*" in *"start manger-postgres-backup.service"*) [ "$INSTALL_TEST_CASE" != service-fail ] || exit 47;; *"enable --now"*) [ "$INSTALL_TEST_CASE" != enable-fail ] || exit 47;; *"is-active --quiet"*) [ "$INSTALL_TEST_CASE" != timer-inactive ] || exit 47;; esac\n',{mode:0o700});
  const result=spawnSync(bash,['scripts/install-postgres-backups.sh'],{cwd:repo,encoding:'utf8',timeout:15000,env:{...process.env,HOME:posix(home),PATH:posix(bin)+':/usr/bin:/bin:'+process.env.PATH,INSTALL_TEST_LOG:posix(log),INSTALL_TEST_CASE:scenario}});
  assert.ifError(result.error);assert.equal(result.status,scenario==='success'?0:scenario==='existing'?1:47,result.stderr);
  const calls=await fs.readFile(log,'utf8').catch(()=> '');
  assert.equal(calls.includes('loginctl enable-linger'),['success','linger-fail','service-fail','enable-fail','timer-inactive'].includes(scenario),calls);
  assert.equal(calls.includes('enable --now'),['success','enable-fail','timer-inactive'].includes(scenario),calls);
  assert.equal(result.stdout.includes('Sauvegardes activées'),scenario==='success');
  if(scenario==='existing')assert.equal(await fs.readFile(join(unitDir,'manger-postgres-backup.service'),'utf8'),'keep original');
  if(scenario==='success'){
    assert.ok(calls.indexOf('backup')<calls.indexOf('loginctl enable-linger'),calls);
    assert.ok(calls.includes('start manger-postgres-backup.service'),calls);
    assert.ok(calls.indexOf('start manger-postgres-backup.service')<calls.indexOf('enable --now'),calls);
  }
  if(scenario==='backup-fail')await assert.rejects(fs.access(unitDir),{code:'ENOENT'});
});
