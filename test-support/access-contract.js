const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

async function accessContract(t, f) {
  const {request,login,issue} = f;
  const accept = (token,username='invitee',cookie) => request('/api/account/join','POST',{token,username,password:'long-password-invitee',admin:true},cookie);
  let owner, member;
  await t.test('administration réservée, liste publique limitée et désactivation atomique',async()=>{
    await f.clearAttempts(); owner=await login(); member=await login('member');
    for (const method of ['GET','POST']) {
      assert.equal((await request('/api/accounts',method,method==='POST'?{}:undefined)).status,401);
      assert.equal((await request('/api/accounts',method,method==='POST'?{}:undefined,member)).status,403);
    }
    assert.equal((await request('/api/accounts','POST',{username:'newmember',password:'long-password-created'},owner)).status,201);
    assert.equal((await request('/api/accounts','POST',{username:'newmember',password:'long-password-created'},owner)).status,400);
    const rows=await (await request('/api/accounts','GET',undefined,owner)).json();
    for(const row of rows)assert.deepEqual(Object.keys(row).sort(),['active','admin','id','username']);
    const me=rows.find(row=>row.username==='admin'),target=rows.find(row=>row.username==='member');
    assert.equal((await request(`/api/accounts/${me.id}`,'PUT',{active:false},owner)).status,400);
    assert.equal((await request('/api/accounts/9007199254740992','PUT',{active:false},owner)).status,400);
    assert.equal((await request(`/api/accounts/${target.id}`,'PUT',{active:false},owner)).status,200);
    assert.equal((await request('/api/account','GET',undefined,member)).status,401);
    assert.equal((await request(`/api/accounts/${target.id}`,'PUT',{active:true},owner)).status,200);
    assert.equal((await request('/api/account','GET',undefined,member)).status,401);
    member=await login('member');
  });
  await t.test('invitation privée hachée, membre seulement, sans connexion automatique',async()=>{
    await f.clearAttempts();
    for(const method of ['POST','DELETE']) {
      assert.equal((await request('/api/accounts/invitation',method,{})).status,401);
      assert.equal((await request('/api/accounts/invitation',method,{},member)).status,403);
    }
    const before=Date.now(),{token,expires}=await issue(owner);
    assert.match(token,/^[a-f0-9]{64}$/); assert.ok(expires>=before+86400000&&expires<=Date.now()+86400000);
    assert.equal((await f.readInvitation()).token,createHash('sha256').update(token).digest('hex'));
    assert.equal((await accept(token,'invitee',owner)).status,409);
    assert.equal((await accept(token,'admin')).status,400); assert.ok(await f.readInvitation());
    const response=await accept(token); assert.equal(response.status,201);assert.equal(response.headers.get('set-cookie'),null);
    assert.equal((await f.auth.findUser('invitee')).admin,0);
    assert.equal((await accept(token,'replay')).status,400);
    const cookie=await login('invitee','long-password-invitee');
    assert.equal((await request('/api/accounts','GET',undefined,cookie)).status,403);
  });
  await t.test('remplacement, révocation, expiration et deux acceptations concurrentes',async()=>{
    await f.clearAttempts();
    const first=await issue(owner),second=await issue(owner);
    assert.equal((await accept(first.token,'old')).status,400);
    assert.equal((await request('/api/accounts/invitation','DELETE',{},owner)).status,200);
    assert.equal((await accept(second.token,'cancelled')).status,400);
    const expired=await issue(owner); await f.expireInvitations(); assert.equal((await accept(expired.token,'expired')).status,400);
    const current=await issue(owner),result=await Promise.all(['one','two'].map(name=>accept(current.token,name)));
    assert.deepEqual(result.map(row=>row.status).sort(),[201,400]);assert.equal(await f.readInvitation(),undefined);
  });
  await t.test('SMTP volontaire, validation, lien valide et destinataire non conservé',async()=>{
    await f.clearAttempts();const {token,expires}=await issue(owner),send=(to,cookie=owner)=>request('/api/accounts/invitation/email','POST',{token,to},cookie);
    assert.equal((await (await request('/api/account','GET',undefined,owner)).json()).invitationEmailEnabled,true);
    assert.equal((await send('personne@example.org',member)).status,403);
    for(const address of ['bad','a@example.org,b@example.org','a@example.org\nBcc: b@example.org'])assert.equal((await send(address)).status,400);
    assert.equal((await send('personne@example.org')).status,200);assert.deepEqual(f.sent,[['personne@example.org',token,expires]]);
    assert.equal(JSON.stringify(await f.allRows()).includes('personne@example.org'),false);
    await request('/api/accounts/invitation','DELETE',{},owner);
    assert.equal((await send('personne@example.org')).status,400); assert.equal(f.sent.length,1);
  });
  await t.test('réservation et erreurs SMTP privées, cinq tentatives maximum sans réessai automatique',async()=>{
    await f.clearAttempts();const {token}=await issue(owner);let calls=0;
    f.setSend(async()=>{calls++;throw new Error('synthetic-private-password smtp.example.org');});
    for(let i=0;i<5;i++) {
      const response=await request('/api/accounts/invitation/email','POST',{token,to:'personne@example.org'},owner);
      assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/synthetic-private|smtp.example.org/);
    }
    assert.equal((await request('/api/accounts/invitation/email','POST',{token,to:'personne@example.org'},owner)).status,429);
    assert.equal(calls,5);assert.ok(await f.readInvitation());
  });
}
module.exports = { accessContract };
