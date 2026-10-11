const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, createDatabase } = require('./server');
const { openAccounts, createAccount } = require('./accounts');

async function fixture(t) {
  const data = createDatabase(':memory:'); const accounts = openAccounts(':memory:');
  const admin = await createAccount(accounts, 'admin', 'long-password-admin', true);
  const member = await createAccount(accounts, 'julie', 'long-password-member');
  const server = createApp(data, undefined, undefined, accounts);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); data.close(); accounts.close(); });
  const request = (path, method = 'GET', value, cookie, origin = base) => fetch(base + path, { method, redirect: 'manual', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
  const login = async (name = 'admin', password = 'long-password-admin') => {
    const res = await request('/api/account/login', 'POST', { username: name, password });
    assert.equal(res.status, 200, await res.clone().text());
    assert.match(res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    return res.headers.get('set-cookie').split(';')[0];
  };
  return { data, accounts, request, login, admin, member };
}
test('authentication protects data, exports and writes; origin is checked', async t => {
  const { request, login, accounts } = await fixture(t);
  assert.equal((await request('/')).status, 303);
  const landing = await request('/login');
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.match(landing.headers.get('content-security-policy'), /img-src 'self'; manifest-src 'self'/);
  for (const path of ['/api/recipes', '/api/household', '/api/backup', '/api/photos/1', '/api/recipes/export', '/calendar.ics', '/api/calendar.ics?start=2026-09-14', '/api/calendar.ics?start=2026-09-14&download=1']) assert.equal((await request(path)).status, 401, path);
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/offline-shopping.js')).status, 200);
  assert.equal((await request('/api/shopping-checks/sync', 'POST', {})).status, 401);
  assert.equal((await request('/api/shopping-manual/1', 'PUT', {})).status, 401);
  const icon = await request('/apple-touch-icon.png');
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get('content-type'), /^image\/png/);
  assert.equal((await request('/api/account/login', 'POST', { username: 'admin', password: 'long-password-admin' }, null, 'https://evil.example')).status, 403);
  const cookie = await login('AdMiN');
  assert.equal((await request('/api/shopping-checks/sync', 'POST', {}, cookie, 'https://evil.example')).status, 403);
  assert.equal((await request('/api/shopping-manual/1', 'PUT', {}, cookie, 'https://evil.example')).status, 403);
  assert.equal((await request('/api/household', 'GET', undefined, cookie)).status, 200);
  const calendar = await request('/api/calendar.ics?start=2026-09-14&download=1', 'GET', undefined, cookie);
  assert.equal(calendar.status, 200);
  assert.equal(calendar.headers.get('content-type'), 'application/octet-stream');
  assert.match(await calendar.text(), /^BEGIN:VCALENDAR\r\n/);
  assert.equal((await request('/api/meals', 'POST', {}, cookie, 'https://evil.example')).status, 403);
  const row = accounts.prepare('SELECT * FROM accounts WHERE username=?').get('admin');
  assert.notEqual(row.password, 'long-password-admin');
  assert.notEqual(accounts.prepare('SELECT token FROM sessions').get().token, cookie.split('=')[1]);
  const res = await request('/api/account', 'GET', undefined, cookie);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal('password' in await res.json(), false);
});
test('administrators create and disable accounts, members cannot restore or administer', async t => {
  const { request, login, member, admin } = await fixture(t);
  const owner = await login(); const guest = await login('julie', 'long-password-member');
  for (const [path, method] of [['/api/accounts','GET'], ['/api/accounts','POST'], ['/api/backup','GET'], ['/api/restore/preview','POST'], ['/api/restore/apply','POST']]) assert.equal((await request(path, method, method === 'POST' ? {} : undefined, guest)).status, 403);
  assert.equal((await request('/api/accounts', 'POST', {username:'nouveau',password:'another-password'}, owner)).status, 201);
  assert.equal((await request('/api/accounts', 'POST', {username:'nouveau',password:'another-password'}, owner)).status, 400);
  assert.equal((await request(`/api/accounts/${admin}`, 'PUT', {active:false}, owner)).status, 400);
  assert.equal((await request(`/api/accounts/${member}`, 'PUT', {active:false}, owner)).status, 200);
  assert.equal((await request('/api/household', 'GET', undefined, guest)).status, 401);
  assert.equal((await request('/api/account/login', 'POST', {username:'julie',password:'long-password-member'})).status, 401);
  assert.equal((await request(`/api/accounts/${member}`, 'PUT', {active:true}, owner)).status, 200);
  await login('julie', 'long-password-member');
  assert.equal((await request('/api/household', 'GET', undefined, guest)).status, 401);
});

test('certificate download is authenticated, administrator-only and unavailable without native local HTTPS', async t => {
  const { request, login } = await fixture(t);
  const endpoint='/api/accounts/certificate';
  assert.equal((await request(endpoint)).status,401);
  const owner=await login(), member=await login('julie','long-password-member');
  assert.equal((await request(endpoint,'GET',undefined,member)).status,403);
  assert.equal((await request(endpoint,'GET',undefined,owner)).status,404);
  const account=await (await request('/api/account','GET',undefined,owner)).json();
  assert.equal(account.localCertificate,null);
});
test('password change revokes all sessions; logout and expiry revoke access', async t => {
  const { request, login, accounts } = await fixture(t);
  const a = await login(), b = await login();
  assert.equal((await request('/api/account/password', 'POST', {current:'long-password-admin',password:'new-password-long'}, a)).status, 200);
  for (const cookie of [a,b]) assert.equal((await request('/api/account', 'GET', undefined, cookie)).status, 401);
  const c = await login('admin','new-password-long');
  assert.equal((await request('/api/account/logout', 'POST', {}, c)).status, 200);
  assert.equal((await request('/api/account', 'GET', undefined, c)).status, 401);
  const d = await login('admin','new-password-long');
  accounts.exec('UPDATE sessions SET expires=0');
  assert.equal((await request('/api/account', 'GET', undefined, d)).status, 401);
});
test('login attempts are bounded, unknown accounts give the same error', async t => {
  const { request } = await fixture(t);
  const wrong = await request('/api/account/login','POST',{username:'admin',password:'wrong-password-long'});
  const unknown = await request('/api/account/login','POST',{username:'unknown',password:'wrong-password-long'});
  assert.equal(wrong.status,401); assert.deepEqual(await wrong.json(), await unknown.json());
  for(let i=1;i<8;i++) assert.equal((await request('/api/account/login','POST',{username:'admin',password:'wrong-password-long'})).status,401);
  assert.equal((await request('/api/account/login','POST',{username:'admin',password:'long-password-admin'})).status,429);
});

test('logout-all revokes only the current account, requires authentication and same origin', async t => {
  const { request, login, member } = await fixture(t);
  const first = await login(), second = await login();
  const other = await login('julie', 'long-password-member');
  assert.equal((await request('/api/account/logout-all','POST',{})).status,401);
  assert.equal((await request('/api/account/logout-all','GET',undefined,first)).status,404);
  assert.equal((await request('/api/account/logout-all','POST',{},first,'https://evil.example')).status,403);
  assert.equal((await request('/api/account','GET',undefined,second)).status,200);
  // A supplied account ID cannot target another person's sessions.
  const result = await request('/api/account/logout-all','POST',{accountId:member},first);
  assert.equal(result.status,200);assert.match(result.headers.get('set-cookie'),/Max-Age=0/);
  for (const cookie of [first,second]) assert.equal((await request('/api/account','GET',undefined,cookie)).status,401);
  assert.equal((await request('/api/account','GET',undefined,other)).status,200);
  await login(); // The password and account remain usable.
  assert.equal((await request('/api/account/logout-all','POST',{},other)).status,200);
  assert.equal((await request('/api/account','GET',undefined,other)).status,401);
});

test('private invitations are administrator-only, hashed, single-use and create members only', async t => {
  const { request, login, accounts } = await fixture(t);
  const owner = await login(), member = await login('julie', 'long-password-member');
  const endpoint = '/api/accounts/invitation';
  for (const method of ['POST', 'DELETE']) {
    assert.equal((await request(endpoint, method, {}, undefined)).status, 401);
    assert.equal((await request(endpoint, method, {}, member)).status, 403);
    assert.equal((await request(endpoint, method, {}, owner, 'https://evil.example')).status, 403);
  }
  const created = await request(endpoint, 'POST', {}, owner);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.equal(created.headers.get('referrer-policy'), 'no-referrer');
  const { token, expires } = await created.json();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.ok(expires > Date.now() && expires <= Date.now() + 86400000);
  assert.notEqual(accounts.prepare('SELECT token FROM invitations').get().token, token);
  const value = { token, username: 'invitee', password: 'long-password-invitee', admin: true };
  assert.equal((await request('/api/account/join', 'POST', value, owner)).status, 409);
  assert.equal((await request('/api/account/join', 'POST', value, undefined, 'https://evil.example')).status, 403);
  assert.equal((await request('/api/account/join', 'POST', { ...value, password: 'short' })).status, 400);
  assert.equal((await request('/api/account/join', 'POST', { ...value, username: 'admin' })).status, 400);
  const accepted = await request('/api/account/join', 'POST', value);
  assert.equal(accepted.status, 201);
  assert.equal(accepted.headers.get('set-cookie'), null);
  assert.equal(accounts.prepare('SELECT admin FROM accounts WHERE username=?').get('invitee').admin, 0);
  assert.equal(accounts.prepare('SELECT count(*) AS n FROM invitations').get().n, 0);
  assert.equal((await request('/api/account/join', 'POST', { ...value, username: 'replay' })).status, 400);
  const guest = await login('invitee', value.password);
  assert.equal((await request('/api/household', 'GET', undefined, guest)).status, 200);
  assert.equal((await request('/api/accounts', 'GET', undefined, guest)).status, 403);
});

test('replacement, revocation, expiry and creator deactivation invalidate invitations', async t => {
  const { request, login, accounts, admin } = await fixture(t);
  const owner = await login();
  const issue = async () => (await (await request('/api/accounts/invitation', 'POST', {}, owner)).json()).token;
  const accept = token => request('/api/account/join', 'POST', { token, username: 'invitee', password: 'long-password-invitee' });
  const first = await issue(), second = await issue();
  assert.notEqual(first, second);
  assert.equal((await accept(first)).status, 400);
  assert.equal((await request('/api/accounts/invitation', 'DELETE', {}, owner)).status, 200);
  assert.equal((await accept(second)).status, 400);
  const expired = await issue();
  accounts.exec('UPDATE invitations SET expires=0');
  assert.equal((await accept(expired)).status, 400);
  const disabled = await issue();
  await createAccount(accounts, 'secondadmin', 'long-password-second', true);
  const other = await login('secondadmin', 'long-password-second');
  assert.equal((await request(`/api/accounts/${admin}`, 'PUT', { active: false }, other)).status, 200);
  assert.equal((await request(`/api/accounts/${admin}`, 'PUT', { active: true }, other)).status, 200);
  assert.equal((await accept(disabled)).status, 400);
  assert.equal(accounts.prepare('SELECT count(*) AS n FROM accounts').get().n, 3);
});

test('concurrent invitation acceptance creates exactly one account', async t => {
  const { request, login, accounts } = await fixture(t);
  const owner = await login();
  const { token } = await (await request('/api/accounts/invitation', 'POST', {}, owner)).json();
  const results = await Promise.all(['inviteone', 'invitetwo'].map(username => request('/api/account/join', 'POST', { token, username, password: 'long-password-invitee' })));
  assert.deepEqual(results.map(res => res.status).sort(), [201, 400]);
  assert.equal(accounts.prepare('SELECT count(*) AS n FROM accounts').get().n, 3);
  assert.equal(accounts.prepare('SELECT count(*) AS n FROM invitations').get().n, 0);
});

test('production boot requires login, CLI bootstraps and recovers persistent accounts', async () => {
  const { mkdtempSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os'); const { join } = require('node:path');
  const { spawnSync } = require('node:child_process');
  const folder = mkdtempSync(join(tmpdir(), 'manger-accounts-test-'));
  const previous = process.env.MANGER_DB;
  process.env.MANGER_DB = join(folder, 'manger.db');
  let server;
  try {
    server = createApp(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/api/household')).status, 401);
    const command = action => {
      const result = spawnSync(process.execPath, [join(__dirname,'accounts.js'), action,'admin'], {env:process.env,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return /Mot de passe généré : (\S+)/.exec(result.stdout)[1];
    };
    const login = async password => {
      const res=await fetch(base+'/api/account/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password})});
      assert.equal(res.status,200);return res.headers.get('set-cookie').split(';')[0];
    };
    const password = command('create-admin'); const cookie=await login(password);
    const backup=await fetch(base+'/api/backup',{headers:{Cookie:cookie,'X-Manger-Backup':'1'}});
    assert.equal(backup.status,200); await backup.arrayBuffer();
    await new Promise(resolve=>server.close(resolve)); server=createApp();
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base+'/api/account',{headers:{Cookie:cookie}})).status,200);
    const replacement=command('reset-password');
    assert.equal((await fetch(base+'/api/account',{headers:{Cookie:cookie}})).status,401);
    await login(replacement);
  } finally {
    if(server?.listening) await new Promise(resolve=>server.close(resolve));
    if(previous===undefined)delete process.env.MANGER_DB;else process.env.MANGER_DB=previous;
    rmSync(folder,{recursive:true,force:true});
  }
});
