const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseFixture } = require('./database');
const { postgresAuth } = require('../db/auth');
const { openPostgres } = require('../db/postgres');

const DAY = 86400000;

test('courses HTTP pendant scrypt sur PostgreSQL réel', {timeout:60000},async t=>{
  const {openAccounts,createAccount}=require('../accounts'),{raceContract}=require('./auth-races');
  const fixture=await databaseFixture(t),db=fixture.database,legacy=openAccounts(':memory:');
  try {
    await createAccount(legacy,'admin','long-password-admin',true);
    await db.query('INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,1)',['admin',legacy.prepare('SELECT password FROM accounts').get().password]);
  } finally {legacy.close();}
  await raceContract(t,{auth:postgresAuth(db),clearAttempts:()=>db.query('DELETE FROM auth.attempts'),
    setActive:active=>db.query('UPDATE auth.accounts SET active=$1',[active?1:0]),
    readPassword:async()=>(await db.query('SELECT password FROM auth.accounts')).rows[0].password,
    setPassword:password=>db.query('UPDATE auth.accounts SET password=$1',[password]),revokeSessions:()=>db.query('DELETE FROM auth.sessions')});
});

test('contrat HTTP connexion/sessions sur PostgreSQL réel', { timeout:60000 }, async t => {
  const { createServer } = require('node:http');
  const { openAccounts, createAccount, protectAccounts } = require('../accounts');
  const { authContract } = require('./auth-contract');
  const fixture = await databaseFixture(t), db = fixture.database;
  const legacy = openAccounts(':memory:');
  try {
    await createAccount(legacy,'admin','long-password-admin',true);
    await createAccount(legacy,'member','long-password-member');
    for (const row of legacy.prepare('SELECT * FROM accounts').all()) {
      await db.query('INSERT INTO auth.accounts(id,username,password,admin,active) VALUES($1,$2,$3,$4,$5)', [row.id===1?5000000001:row.id,row.username,row.password,row.admin,row.active]);
    }
  } finally { legacy.close(); }
  const handler = (req,res) => { res.writeHead(['/api/health','/api/household'].includes(req.url)?200:404);res.end('{}'); };
  const server=createServer(protectAccounts(null,handler,{ auth:postgresAuth(db) }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(path,method='GET',value,cookie,origin=base)=>fetch(base+path,{method,redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:value===undefined?undefined:JSON.stringify(value)});
  const login=async(name='admin',password='long-password-admin')=>{
    const response=await request('/api/account/login','POST',{username:name,password});
    assert.equal(response.status,200,await response.clone().text());
    assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Max-Age=604800/);
    return response.headers.get('set-cookie').split(';')[0];
  };
  await authContract(t,{request,login,admin:5000000001,member:2,
    clearAttempts:()=>db.query('DELETE FROM auth.attempts'),expireSessions:()=>db.query('UPDATE auth.sessions SET expires=0'),
    sessions:async()=>(await db.query('SELECT token,expires FROM auth.sessions ORDER BY token')).rows});
  const cookie=await login('admin','replacement-password');
  await t.test('parcours PostgreSQL non portés fermés explicitement, sans appel SQLite',async()=>{
    // Access administration is covered by the shared step-06 contract; household backup is not ported yet.
    for(const [path,method] of [['/api/backup','GET'],['/api/restore/preview','POST']]) {
      assert.equal((await request(path,method,method==='POST'?{}:undefined,cookie)).status,503);
    }
  });
  await t.test('panne PostgreSQL : 503 sans fuite ni cookie, reprise explicite sans nouveau login',async()=>{
    await fixture.stop();
    try {
      const response=await request('/api/account','GET',undefined,cookie);
      assert.equal(response.status,503); assert.equal(response.headers.get('set-cookie'),null);
      assert.doesNotMatch(await response.text(),/SELECT|password|manger_test|127\.0\.0\.1|stack|code.*57P/);
    } finally {await fixture.start();}
    assert.equal((await request('/api/account','GET',undefined,cookie)).status,200);
  });
});

test('dépôt PostgreSQL connexion/sessions', { timeout: 60000 }, async t => {
  const fixture = await databaseFixture(t), db = fixture.database, auth = postgresAuth(db);
  const id = 5000000001, password = 'synthetic-encoded-password';
  await db.query('INSERT INTO auth.accounts(id,username,password,admin) VALUES($1,$2,$3,1)', [id, 'admin', password]);
  const user = await auth.findUser('admin');

  await t.test('identifiants numériques sûrs, mêmes champs et aucun amorçage', async () => {
    assert.deepEqual(user, { id, username:'admin', password, admin:1, active:1 });
    assert.equal(await auth.findUser('unknown'), undefined);
    assert.equal(await auth.findUser('unknown\0'), undefined);
  });
  await t.test('session hachée, expiration absolue, compte désactivé et jeton inconnu refusés', async () => {
    const before = Date.now();
    assert.equal(await auth.startSession(user, 'synthetic-hashed-token'), true);
    const row = await auth.session('synthetic-hashed-token');
    assert.equal(row.id, id); assert.equal(row.token, 'synthetic-hashed-token');
    const expiry = Number((await db.query('SELECT expires FROM auth.sessions')).rows[0].expires);
    assert.ok(expiry >= before + 7 * DAY && expiry <= Date.now() + 7 * DAY);
    assert.equal(await auth.session('unknown'), undefined);
    await db.query('UPDATE auth.accounts SET active=0 WHERE id=$1', [id]);
    assert.equal(await auth.session(row.token), undefined);
    assert.equal(await auth.startSession(user, 'disabled'), false);
    await db.query('UPDATE auth.accounts SET active=1 WHERE id=$1', [id]);
    await db.query('UPDATE auth.sessions SET expires=0');
    assert.equal(await auth.session(row.token), undefined);
  });
  await t.test('mot de passe modifié après lecture : ancienne preuve de connexion inutilisable', async () => {
    await db.query('UPDATE auth.accounts SET password=$1 WHERE id=$2', ['reset', id]);
    assert.equal(await auth.startSession(user, 'stale'), false);
    await db.query('UPDATE auth.accounts SET password=$1 WHERE id=$2', [password, id]);
  });
  await t.test('déconnexion ciblée ou globale limitée au compte courant', async () => {
    await auth.startSession(user, 'first'); await auth.startSession(user, 'second');
    await db.query('INSERT INTO auth.accounts(id,username,password) VALUES(2,$1,$2)', ['member', password]);
    const other = await auth.findUser('member'); await auth.startSession(other, 'other');
    await auth.logout({ ...user, token:'first' }, false);
    assert.equal(await auth.session('first'), undefined); assert.ok(await auth.session('second'));
    await auth.logout({ ...user,token:'second' }, true);
    assert.equal(await auth.session('second'), undefined); assert.ok(await auth.session('other'));
  });
  await t.test('déconnexion globale retardée : jeton révoqué ne supprime pas les nouvelles sessions', async () => {
    await auth.startSession(user, 'revoke-me'); const stale = await auth.session('revoke-me');
    await db.query('DELETE FROM auth.sessions WHERE token=$1', ['revoke-me']);
    await auth.startSession(user, 'fresh-after-revocation');
    assert.equal(await auth.logout(stale, true), false);
    assert.ok(await auth.session('fresh-after-revocation'));
  });
  await t.test('purge ne bloque pas sur une session expirée verrouillée par une autre transaction', async () => {
    await auth.startSession(user, 'locked-expired');
    await db.query('UPDATE auth.sessions SET expires=0 WHERE token=$1', ['locked-expired']);
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT token FROM auth.sessions WHERE token=$1 FOR UPDATE', ['locked-expired']);
      assert.equal(await auth.startSession(user, 'after-locked-expiry'), true);
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
  await t.test('changement de mot de passe et révocation atomiques, session supprimée ou expirée refuse', async () => {
    await auth.startSession(user, 'password-session');
    assert.equal(await auth.changePassword({ ...user, token:'missing' }, 'must-not-apply'), false);
    await db.query('UPDATE auth.sessions SET expires=0 WHERE token=$1', ['password-session']);
    assert.equal(await auth.changePassword({ ...user, token:'password-session' }, 'must-not-apply'), false);
    await auth.startSession(user, 'password-session-new'); await auth.startSession(user, 'another');
    assert.equal(await auth.changePassword({ ...user, token:'password-session-new' }, 'replacement'), true);
    assert.equal((await auth.findUser('admin')).password, 'replacement');
    assert.equal(await auth.session('another'), undefined);
    assert.ok(await auth.session('other'));
    await db.query('UPDATE auth.accounts SET password=$1 WHERE id=$2', [password, id]);
  });
  await t.test('expiration pendant l’attente du verrou compte refuse le changement',async()=>{
    await auth.startSession(user,'expires-while-waiting');
    const expires=Date.now()+200;
    await db.query('UPDATE auth.sessions SET expires=$1 WHERE token=$2',[expires,'expires-while-waiting']);
    const blocker=await fixture.pool.connect(); let work;
    try {
      await blocker.query('BEGIN'); await blocker.query('SELECT id FROM auth.accounts WHERE id=$1 FOR UPDATE',[id]);
      work=auth.changePassword({...user,token:'expires-while-waiting'},'must-not-apply');
      const deadline=Date.now()+1000;let waiting=false;
      while(Date.now()<deadline){
        waiting=(await fixture.pool.query("SELECT 1 FROM pg_stat_activity WHERE usename=current_user AND application_name='manger' AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'" )).rowCount>0;
        if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.equal(waiting,true,'la vraie requête doit attendre le verrou');
      await new Promise(resolve=>setTimeout(resolve,Math.max(0,expires-Date.now()+20)));
    } finally {await blocker.query('ROLLBACK');blocker.release();}
    assert.equal(await work,false);assert.equal((await auth.findUser('admin')).password,password);
  });
  await t.test('échec SQL après changement du hachage : rollback du mot de passe et des sessions',async()=>{
    await auth.startSession(user,'rollback-session');
    const broken=postgresAuth({...db,transaction:work=>db.transaction(tx=>work({query:(sql,values)=>
      tx.query(sql==='DELETE FROM auth.sessions WHERE account_id=$1'?'SELECT 1/0':sql,sql==='DELETE FROM auth.sessions WHERE account_id=$1'?[]:values)}))});
    await assert.rejects(broken.changePassword({...user,token:'rollback-session'},'must-not-apply'),{code:'22012'});
    assert.equal((await auth.findUser('admin')).password,password);assert.ok(await auth.session('rollback-session'));
  });
  await t.test('tentatives atomiques entre deux pools, aucun compteur partiellement incrémenté', async () => {
    const second = await openPostgres(fixture.config), other = postgresAuth(second);
    try {
      const keys = [['global',60],['ip:synthetic',20],['name:synthetic',8]];
      const results = await Promise.all(Array.from({ length:18 }, (_, index) => (index % 2 ? auth : other).throttle(keys)));
      assert.equal(results.filter(Boolean).length, 8);
      assert.deepEqual((await db.query('SELECT count FROM auth.attempts ORDER BY key')).rows.map(row => row.count), [8,8,8]);
      await db.query('UPDATE auth.attempts SET expires=0');
      assert.equal(await auth.throttle(keys), true);
      assert.deepEqual((await db.query('SELECT count FROM auth.attempts')).rows.map(row => row.count), [1,1,1]);
    } finally { await second.close(); }
  });
});
