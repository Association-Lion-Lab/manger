const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseFixture } = require('./database');
const { postgresAuth } = require('../db/auth');
const { openPostgres } = require('../db/postgres');

async function blocked(db, sql) {
  const until=Date.now()+1500;
  while(Date.now()<until) {
    if ((await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query=$1",[sql])).rowCount) return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  throw new Error('Attente réelle de verrou non observée.');
}

test('invitations et administration sur PostgreSQL réel', { timeout:60000 }, async t => {
  const f = await databaseFixture(t), db = f.database, auth = postgresAuth(db);
  await db.query("INSERT INTO auth.accounts(username,password,admin) VALUES('admin','synthetic-hash',1),('secondadmin','synthetic-hash',1),('member','synthetic-hash',0)");
  const owner = await auth.findUser('admin'), second = await auth.findUser('secondadmin'), member = await auth.findUser('member');
  await auth.startSession(owner, 'owner-session'); await auth.startSession(second, 'second-session'); await auth.startSession(member, 'member-session');
  const admin = await auth.session('owner-session'), other = await auth.session('second-session'), guest = await auth.session('member-session');

  await t.test('droits revalidés et DTO de liste sans secret', async () => {
    assert.equal(await auth.listAccounts(guest), 'forbidden');
    const rows = await auth.listAccounts(admin);
    assert.deepEqual(rows.map(row => row.username), ['admin','member','secondadmin']);
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['active','admin','id','username']);
    assert.equal(await auth.addAccount({...admin,password:'stale'}, 'forbidden', 'hash', true), 'forbidden');
    assert.equal(await auth.addAccount(admin, 'added', 'hash', false), true);
    assert.equal(await auth.addAccount(admin, 'added', 'hash', true), 'duplicate');
    assert.equal((await auth.findUser('added')).admin, 0);
  });
  await t.test('remplacement, annulation et expiration absolue du lien', async () => {
    assert.equal(await auth.issueInvitation(guest, 'denied'), 'forbidden');
    const before = Date.now(), issued = await auth.issueInvitation(admin, 'first-hash');
    assert.ok(issued.expires >= before + 86400000 && issued.expires <= Date.now() + 86400000);
    assert.ok(await auth.invitation('first-hash'));
    await auth.issueInvitation(admin, 'second-hash'); assert.equal(await auth.invitation('first-hash'), undefined);
    assert.equal(await auth.revokeInvitation(admin), true); assert.equal(await auth.invitation('second-hash'), undefined);
    await auth.issueInvitation(admin, 'expired-hash'); await db.query('UPDATE auth.invitations SET expires=0');
    assert.equal(await auth.join('expired-hash', 'expired', 'hash'), 'invitation');
    assert.equal(await auth.findUser('expired'), undefined);
  });
  await t.test('une seule consommation gagne entre deux pools ; doublon conserve le lien', async () => {
    const peer = await openPostgres(f.config);
    try {
      await auth.issueInvitation(admin, 'unique-hash');
      assert.equal(await auth.join('unique-hash', 'admin', 'hash'), 'duplicate-invitee');
      assert.ok(await auth.invitation('unique-hash'));
      const result = await Promise.all([auth.join('unique-hash','inviteone','hash'),postgresAuth(peer).join('unique-hash','invitetwo','hash')]);
      assert.deepEqual(result.sort(), [true,'invitation'].sort());
      const rows = (await db.query("SELECT admin FROM auth.accounts WHERE username IN ('inviteone','invitetwo')")).rows;
      assert.deepEqual(rows, [{admin:0}]); assert.equal(await auth.invitation('unique-hash'), undefined);
    } finally { await peer.close(); }
  });
  await t.test('désactivation et révocation sont atomiques ; propre compte protégé', async () => {
    assert.equal(await auth.setActive(admin, owner.id, false), 'self');
    assert.equal(await auth.setActive(admin, 9000000000, false), 'missing');
    await auth.issueInvitation(other, 'creator-hash');
    assert.equal(await auth.setActive(admin, second.id, false), true);
    assert.equal(await auth.session(other.token), undefined); assert.equal(await auth.invitation('creator-hash'), undefined);
    assert.equal(await auth.join('creator-hash','replay','hash'), 'invitation');
    assert.equal(await auth.setActive(admin, second.id, true), true);
    assert.equal(await auth.issueInvitation(other, 'stale-session'), 'forbidden');
  });
  await t.test('erreur après insertion : aucun compte partiel, invitation toujours utilisable', async () => {
    await auth.issueInvitation(admin, 'rollback-hash');
    const broken = postgresAuth({...db,transaction:work => db.transaction(tx => work({...tx,query:(sql,values) =>
      tx.query(sql === 'DELETE FROM auth.invitations WHERE token=$1' ? 'SELECT 1/0' : sql, sql === 'DELETE FROM auth.invitations WHERE token=$1' ? [] : values)}))});
    await assert.rejects(broken.join('rollback-hash','rolledback','hash'), {code:'22012'});
    assert.equal(await auth.findUser('rolledback'), undefined); assert.ok(await auth.invitation('rollback-hash'));
  });
  await t.test('cinq réservations SMTP maximum partagées entre deux pools, sans destinataire stocké', async () => {
    const peer = await openPostgres(f.config);
    try {
      await auth.issueInvitation(admin, 'mail-hash');
      const repositories = [auth,postgresAuth(peer)];
      const results = await Promise.all(Array.from({length:8}, (_,i) => repositories[i%2].prepareMail(admin,'mail-hash')));
      assert.equal(results.filter(row => row.expires).length, 5);
      assert.equal(results.filter(row => row === 'mail-limit').length, 3);
      assert.equal((await db.query("SELECT count FROM auth.attempts WHERE key='invitation-mail'")).rows[0].count, 5);
      await db.query("UPDATE auth.attempts SET expires=0 WHERE key='invitation-mail'");
      assert.ok((await auth.prepareMail(admin, 'mail-hash')).expires);
      assert.equal(await auth.prepareMail(admin, 'absent'), 'invitation-mail');
      assert.equal(await auth.prepareMail(guest, 'mail-hash'), 'forbidden');
    } finally { await peer.close(); }
  });
  await t.test('session révoquée pendant attente du verrou global interdit toute invitation',async()=>{
    const client=await f.pool.connect();let work;
    try {
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(1296125511,3)');
      work=auth.issueInvitation(admin,'must-not-exist');
      await blocked(db,'SELECT pg_advisory_xact_lock(1296125511,3)');
      await db.query('DELETE FROM auth.sessions WHERE token=$1',[admin.token]);
    } finally {await client.query('ROLLBACK');client.release();}
    assert.equal(await work,'forbidden');assert.equal(await auth.invitation('must-not-exist'),undefined);
    await auth.startSession(owner,admin.token);
  });
  await t.test('expiration du lien pendant attente du créateur interdit la consommation',async()=>{
    await auth.issueInvitation(admin,'expires-waiting');
    const expiry=Date.now()+250;await db.query('UPDATE auth.invitations SET expires=$1',[expiry]);
    const client=await f.pool.connect();let work;
    try {
      await client.query('BEGIN');await client.query('SELECT id FROM auth.accounts WHERE id=$1 FOR UPDATE',[owner.id]);
      work=auth.join('expires-waiting','too-late','hash');
      await blocked(db,'SELECT password,active,admin FROM auth.accounts WHERE id=$1 FOR UPDATE');
      while(Date.now()<=expiry)await new Promise(resolve=>setTimeout(resolve,5));
    } finally {await client.query('ROLLBACK');client.release();}
    assert.equal(await work,'invitation');assert.equal(await auth.findUser('too-late'),undefined);
  });
  await t.test('désactivation en échec : compte, sessions et invitation intégralement restaurés',async()=>{
    await auth.startSession(second,'second-new');const fresh=await auth.session('second-new');
    await auth.issueInvitation(fresh,'rollback-disable');
    const broken=postgresAuth({...db,transaction:work=>db.transaction(tx=>work({...tx,query:(sql,values)=>
      tx.query(sql==='DELETE FROM auth.sessions WHERE account_id=$1'?'SELECT 1/0':sql,sql==='DELETE FROM auth.sessions WHERE account_id=$1'?[]:values)}))});
    await assert.rejects(broken.setActive(admin,second.id,false),{code:'22012'});
    assert.equal((await auth.findUser('secondadmin')).active,1);assert.ok(await auth.session(fresh.token));assert.ok(await auth.invitation('rollback-disable'));
  });
  await t.test('administration et changement de mot de passe concurrents sans droit périmé ni blocage croisé',async()=>{
    const fresh=await auth.session('second-new');
    const [addition,changed]=await Promise.all([auth.addAccount(fresh,'concurrent-admin','hash',true),auth.changePassword(fresh,'new-synthetic-hash')]);
    assert.equal(changed,true);assert.ok(addition===true||addition==='forbidden');
    assert.equal(Boolean(await auth.findUser('concurrent-admin')),addition===true);
    assert.equal(await auth.session(fresh.token),undefined);
  });
  await t.test('deux administrateurs se désactivent simultanément : une seule opération autorisée',async()=>{
    const peer=await openPostgres(f.config);
    try {
      const current=await auth.findUser('secondadmin');await auth.startSession(current,'second-final');const fresh=await auth.session('second-final');
      const results=await Promise.all([auth.setActive(admin,second.id,false),postgresAuth(peer).setActive(fresh,owner.id,false)]);
      assert.deepEqual(results.sort(),[true,'forbidden'].sort());
      assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.accounts WHERE id=ANY($1::bigint[]) AND active=1',[[owner.id,second.id]])).rows[0].n,1);
    } finally {await peer.close();}
  });
});
