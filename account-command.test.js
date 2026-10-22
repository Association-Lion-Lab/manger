const test=require('node:test');
const assert=require('node:assert/strict');
const {openAccounts}=require('./accounts');
const {sqliteAuth}=require('./db/auth-sqlite');
const {commandContract}=require('./test-support/account-command-contract');

test('commandes locales de récupération SQLite',async t=>{
  const db=openAccounts(':memory:');t.after(()=>db.close());
  await commandContract(t,{auth:sqliteAuth(db),
    seedMember:encoded=>db.prepare("INSERT INTO accounts(username,password) VALUES('member',?)").run(encoded),
    disableMember:()=>db.exec("UPDATE accounts SET active=0 WHERE username='member'")});
});

test('commande PostgreSQL incomplète refusée avant toute ouverture SQLite',()=>{
  const {spawnSync}=require('node:child_process');const {join,dirname,basename}=require('node:path');
  const {mkdtempSync,realpathSync,readdirSync,rmSync}=require('node:fs');const {tmpdir}=require('node:os');
  const parent=realpathSync(tmpdir()),folder=realpathSync(mkdtempSync(join(parent,'manger-cli-test-')));
  try {
    const result=spawnSync(process.execPath,[join(__dirname,'accounts.js'),'create-admin','admin'],{
      env:{...process.env,MANGER_STORAGE:'postgres',MANGER_DB:join(folder,'manger.db')},encoding:'utf8',timeout:10000,windowsHide:true});
    assert.equal(result.status,1);assert.match(result.stderr,/PostgreSQL/);assert.deepEqual(readdirSync(folder),[]);
  } finally {
    if(dirname(folder)!==parent||!basename(folder).startsWith('manger-cli-test-'))throw new Error('Répertoire de test non reconnu.');
    rmSync(folder,{recursive:true});
  }
});

test('réinitialisation SQLite en échec : hachage et sessions restaurés ensemble',async t=>{
  const {createAccount,accountCommand}=require('./accounts');
  const db=openAccounts(':memory:');t.after(()=>db.close());await createAccount(db,'admin','long-password-admin',true);
  const auth=sqliteAuth(db),before=auth.findUser('admin');auth.startSession(before,'keep-session');
  db.exec("CREATE TRIGGER fail_reset_revoke BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'synthetic revoke failure'); END;");
  await assert.rejects(accountCommand(auth,'reset-password','admin'),/synthetic revoke failure/);
  assert.equal(auth.findUser('admin').password,before.password);assert.ok(auth.session('keep-session'));
});
