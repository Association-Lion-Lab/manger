const assert = require('node:assert/strict');

async function authContract(t, f) {
  const ownerPassword = 'long-password-admin', memberPassword = 'long-password-member';
  const memberName = f.memberName || 'member';
  async function scenario(name, work) {
    await t.test(name, async () => { await f.clearAttempts(); await work(); });
  }
  await scenario('accès/export sans session refusés, pages publiques et origine conservées', async () => {
    assert.equal((await f.request('/')).status, 303);
    assert.equal((await f.request('/login')).status, 200);
    assert.equal((await f.request('/api/health')).status, 200);
    for (const path of ['/api/household','/api/recipes/export','/api/backup','/api/calendar.ics','/api/accounts']) assert.equal((await f.request(path)).status,401,path);
    assert.equal((await f.request('/api/account/login','POST',{username:'admin',password:ownerPassword},null,'https://evil.example')).status,403);
  });
  await scenario('mauvais mot de passe et compte inconnu indiscernables, entrées invalides refusées', async () => {
    const first = await f.request('/api/account/login','POST',{username:'admin',password:'wrong-password-long'});
    assert.equal(first.status,401); const error = await first.json();
    for (const name of ['unknown','unknown\0']) {
      const response=await f.request('/api/account/login','POST',{username:name,password:'wrong-password-long'});
      assert.equal(response.status,401); assert.deepEqual(await response.json(),error);
    }
    for (const value of [null,[],{username:'admin',password:'x'.repeat(5000)}]) assert.equal((await f.request('/api/account/login','POST',value)).status,400);
  });
  await scenario('cookie, jeton haché, ID numérique et expiration absolue sans prolongation', async () => {
    const cookie=await f.login('AdMiN',ownerPassword), raw=cookie.split('=')[1];
    const before=await f.sessions();
    assert.ok(before.some(row=>row.token!==raw));
    assert.ok(!before.some(row=>row.token===raw));
    const response=await f.request('/api/account','GET',undefined,cookie), value=await response.json();
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(value.id,f.admin); assert.equal(typeof value.id,'number'); assert.equal(value.admin,true);
    assert.deepEqual(Object.keys(value).sort(),['admin','id','invitationEmailEnabled','localCertificate','username']);
    assert.deepEqual(await f.sessions(),before);
    await f.expireSessions(); assert.equal((await f.request('/api/account','GET',undefined,cookie)).status,401);
  });
  await scenario('déconnexion ciblée/globale du seul compte courant et interdits administrateur', async () => {
    const first=await f.login(), second=await f.login(), other=await f.login(memberName,memberPassword);
    assert.equal((await f.request('/api/account/logout','POST',{},first)).status,200);
    assert.equal((await f.request('/api/account','GET',undefined,first)).status,401);
    assert.equal((await f.request('/api/account','GET',undefined,second)).status,200);
    assert.equal((await f.request('/api/account/logout-all','POST',{},second,'https://evil.example')).status,403);
    for (const path of ['/api/accounts','/api/backup','/api/restore/preview']) assert.equal((await f.request(path,'GET',undefined,other)).status,403);
    const result=await f.request('/api/account/logout-all','POST',{accountId:f.member},second);
    assert.equal(result.status,200); assert.match(result.headers.get('set-cookie'),/Max-Age=0/);
    assert.equal((await f.request('/api/account','GET',undefined,second)).status,401);
    assert.equal((await f.request('/api/account','GET',undefined,other)).status,200);
  });
  await scenario('changement de mot de passe révoque toutes ses sessions, pas celles du voisin', async () => {
    const first=await f.login(), second=await f.login(), other=await f.login(memberName,memberPassword);
    assert.equal((await f.request('/api/account/password','POST',{current:'wrong-password-long',password:'replacement-password'},first)).status,400);
    assert.equal((await f.request('/api/account/password','POST',{current:ownerPassword,password:'short'},first)).status,400);
    assert.equal((await f.request('/api/account/password','POST',{current:ownerPassword,password:'replacement-password'},first)).status,200);
    for (const cookie of [first,second]) assert.equal((await f.request('/api/account','GET',undefined,cookie)).status,401);
    assert.equal((await f.request('/api/account','GET',undefined,other)).status,200);
    assert.equal((await f.request('/api/account/login','POST',{username:'admin',password:ownerPassword})).status,401);
    await f.login('admin','replacement-password');
  });
}

module.exports = { authContract };
