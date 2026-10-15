const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:net');
const nodemailer = require('nodemailer');
const { createHash } = require('node:crypto');
const { createInvitationMailer, emailAddress } = require('./invitation-mail');
const { createApp, createDatabase } = require('./server');
const { openAccounts, createAccount } = require('./accounts');

const config = { MANGER_SMTP_HOST: 'smtp.example.org', MANGER_SMTP_FROM: 'admin@example.org', MANGER_APP_URL: 'https://192.168.1.31:3000' };
const token = 'a'.repeat(64), expires = () => Date.now() + 86400000;

test('SMTP is opt-in, validates configuration and insists on verified TLS', async () => {
  let options, calls = 0;
  const factory = value => { options = value; return { async sendMail() { calls++; return { accepted: ['personne@example.org'], rejected: [] }; } }; };
  assert.equal(createInvitationMailer({}, factory), null);
  assert.equal(calls, 0);
  for (const extra of [{ MANGER_SMTP_HOST: 'https://evil.example/' }, { MANGER_SMTP_PORT: '0' }, { MANGER_SMTP_FROM: 'a@example.org,b@example.org' }, { MANGER_SMTP_USER: 'admin' }, { MANGER_APP_URL: 'https://admin:secret@example.org' }, { MANGER_APP_URL: 'https://example.org/sub' }, { MANGER_APP_URL: 'https://example.org/?x=1' }]) assert.throws(() => createInvitationMailer({ ...config, ...extra }, factory));
  const mailer = createInvitationMailer({ ...config, MANGER_SMTP_USER: 'admin', MANGER_SMTP_PASSWORD: 'private-secret' }, factory);
  assert.equal(calls, 0); assert.equal(options.secure, false); assert.equal(options.requireTLS, true);
  assert.equal(options.port, 587); assert.equal(options.tls.minVersion, 'TLSv1.2');
  assert.equal(options.tls.rejectUnauthorized, true); assert.equal(options.disableFileAccess, true); assert.equal(options.disableUrlAccess, true);
  assert.equal(options.logger, false); assert.equal(options.debug, false); assert.equal(options.socketTimeout, 10000);
  await mailer.send('personne@example.org', token, expires()); assert.equal(calls, 1);
  createInvitationMailer({ ...config, MANGER_SMTP_PORT: '465' }, factory); assert.equal(options.secure, true);
  for (const value of ['', 'not-an-email', 'nom <a@example.org>', 'a@example.org,b@example.org', 'a@example.org\r\nBcc: b@example.org', 'a..b@example.org', '.a@example.org', 'a@-bad.example', 'a@bad_.example', null, ['a@example.org']]) assert.throws(() => emailAddress(value));
  assert.equal(emailAddress(' Personne+foyer@EXAMPLE.org '), 'Personne+foyer@EXAMPLE.org');
});

test('invitation MIME contains only the fixed canonical link and one recipient', async () => {
  let message, envelope;
  const mailer = createInvitationMailer(config, () => ({ async sendMail(mail) {
    const output = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' }).sendMail(mail);
    message = output.message.toString(); envelope = output.envelope;
    return { accepted: ['personne@example.org'], rejected: [] };
  } }));
  await mailer.send('personne@example.org', token, expires());
  assert.deepEqual(envelope, { from: 'admin@example.org', to: ['personne@example.org'] });
  // Decode quoted-printable soft wrapping for the long fragment token.
  const text = message.replace(/=\r\n/g, '').replace(/=([A-F0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  assert.ok(text.includes(config.MANGER_APP_URL + '/login#invite=' + token));
  assert.ok(Buffer.from(text,'latin1').toString('utf8').includes('demande d’abord le certificat public et les instructions'));
  assert.match(message, /Content-Type: text\/plain/); assert.doesNotMatch(message, /Bcc:|Content-Type: text\/html|multipart\/mixed/);
  await assert.rejects(mailer.send('personne@example.org', 'bad', expires()));
  await assert.rejects(mailer.send('personne@example.org', token, 0));
  const rejected = createInvitationMailer(config, () => ({ async sendMail() { return { accepted: [], rejected: ['personne@example.org'] }; } }));
  await assert.rejects(rejected.send('personne@example.org', token, expires()));
});

test('a real SMTP connection cannot send to a server without STARTTLS', async t => {
  const commands = [], sockets = new Set();
  const smtp = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.write('220 local test\r\n');
    let buffer = '';
    socket.on('data', chunk => { buffer += chunk; let end; while ((end = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 2); commands.push(line);
      if (/^EHLO /i.test(line)) socket.write('250 local test\r\n');
      else if (/^STARTTLS/i.test(line)) socket.write('502 TLS unavailable\r\n');
      else socket.write('500 unexpected command\r\n');
    } });
  });
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => smtp.close(resolve)); });
  const mailer = createInvitationMailer({ ...config, MANGER_SMTP_HOST: '127.0.0.1', MANGER_SMTP_PORT: String(smtp.address().port) });
  await assert.rejects(mailer.send('personne@example.org', token, expires()));
  assert.ok(commands.some(line => /^EHLO /.test(line))); assert.ok(commands.includes('STARTTLS'));
  assert.equal(commands.some(line => /^(AUTH|MAIL FROM|RCPT TO|DATA)/i.test(line)), false);
});

async function fixture(t, mailer) {
  const data = createDatabase(':memory:'), accounts = openAccounts(':memory:');
  await createAccount(accounts, 'admin', 'long-password-admin', true);
  await createAccount(accounts, 'member', 'long-password-member');
  const server = createApp(data, accounts, undefined, mailer);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); data.close(); accounts.close(); });
  const request = (path, method = 'GET', value, cookie, origin = base) => fetch(base + path, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
  const login = async (username = 'admin') => { const res = await request('/api/account/login', 'POST', { username, password: `long-password-${username}` }); assert.equal(res.status, 200); return res.headers.get('set-cookie').split(';')[0]; };
  const owner = await login(), member = await login('member');
  const issue = async () => (await (await request('/api/accounts/invitation', 'POST', {}, owner)).json()).token;
  const send = (token, to = 'personne@example.org', cookie = owner, origin = base) => request('/api/accounts/invitation/email', 'POST', { token, to }, cookie, origin);
  return { accounts, request, owner, member, issue, send };
}

test('mail capability is administrator-only and absent without SMTP', async t => {
  const { request, owner, member, issue, send } = await fixture(t, null);
  assert.equal((await (await request('/api/account', 'GET', undefined, owner)).json()).invitationEmailEnabled, false);
  assert.equal((await send(await issue())).status, 503);
  assert.equal((await send(token, undefined, member)).status, 403);
  assert.equal((await send(token, undefined, null)).status, 401);
});

test('email validates the current invitation, preserves it and never stores the recipient', async t => {
  const sent = [];
  const { accounts, request, owner, member, issue, send } = await fixture(t, { async send(...args) { sent.push(args); } });
  assert.equal((await (await request('/api/account', 'GET', undefined, owner)).json()).invitationEmailEnabled, true);
  assert.equal((await (await request('/api/account', 'GET', undefined, member)).json()).invitationEmailEnabled, false);
  const first = await issue();
  assert.equal((await send(first, undefined, owner, 'https://evil.example')).status, 403);
  assert.equal((await send(first, undefined, member)).status, 403);
  for (const to of ['bad', 'a@example.org,b@example.org', 'nom <a@example.org>', 'a@example.org\nBcc: b@example.org']) assert.equal((await send(first, to)).status, 400);
  assert.equal((await send('bad')).status, 400);
  const second = await issue(); assert.equal((await send(first)).status, 400);
  accounts.exec('UPDATE invitations SET expires=0'); assert.equal((await send(second)).status, 400);
  const third = await issue(); await request('/api/accounts/invitation', 'DELETE', {}, owner); assert.equal((await send(third)).status, 400);
  const current = await issue(), before = accounts.prepare('SELECT * FROM invitations').get();
  accounts.exec('UPDATE accounts SET admin=0 WHERE id=1');
  assert.equal((await send(current)).status, 403);
  accounts.exec('UPDATE accounts SET admin=1 WHERE id=1');
  assert.equal((await send(current, ' Personne+foyer@EXAMPLE.org ')).status, 200);
  assert.deepEqual(sent, [['Personne+foyer@EXAMPLE.org', current, before.expires]]);
  assert.deepEqual(accounts.prepare('SELECT * FROM invitations').get(), before);
  assert.equal(before.token, createHash('sha256').update(current).digest('hex'));
  for (const table of ['accounts', 'sessions', 'invitations', 'attempts']) assert.equal(JSON.stringify(accounts.prepare(`SELECT * FROM ${table}`).all()).includes('Personne+foyer'), false);
  assert.equal((await request('/api/account/join', 'POST', { token: current, username: 'invitee', password: 'long-password-invitee' })).status, 201);
  assert.equal((await send(current)).status, 400); assert.equal(sent.length, 1);
});

test('a disabled creator invalidates mail even when another administrator sends it', async t => {
  let calls = 0;
  const { accounts, issue, send, request } = await fixture(t, { async send() { calls++; } });
  const current = await issue();
  await createAccount(accounts, 'secondadmin', 'long-password-secondadmin', true);
  const login = await request('/api/account/login', 'POST', { username: 'secondadmin', password: 'long-password-secondadmin' });
  assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie').split(';')[0];
  // Retain the invitation to also exercise the creator check, independently of the UI revoke route.
  accounts.exec('UPDATE accounts SET active=0 WHERE id=1');
  assert.equal((await send(current, undefined, cookie)).status, 400);
  assert.equal((await send(current)).status, 401); assert.equal(calls, 0);
});

test('SMTP failures stay private, simultaneous sends are blocked and limits persist', async t => {
  let calls = 0, finish;
  const mailer = { async send() { calls++; if (calls === 1) await new Promise(resolve => { finish = resolve; }); else throw new Error('smtp.example.org private-password ' + token); } };
  const { accounts, issue, send } = await fixture(t, mailer), current = await issue();
  const pending = send(current);
  while (!finish) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await send(current)).status, 429); assert.equal(calls, 1);
  finish(); assert.equal((await pending).status, 200);
  for (let i = 0; i < 4; i++) {
    const res = await send(current); assert.equal(res.status, 503);
    const error = await res.text(); assert.doesNotMatch(error, /smtp\.example|private-password|a{64}/); assert.match(error, /Vérifie la boîte/);
  }
  assert.equal((await send(current)).status, 429); assert.equal(calls, 5);
  assert.equal(accounts.prepare("SELECT count FROM attempts WHERE key='invitation-mail'").get().count, 5);
  assert.ok(accounts.prepare('SELECT * FROM invitations').get());
  accounts.exec("UPDATE attempts SET expires=0 WHERE key='invitation-mail'");
  assert.equal((await send(current)).status, 503); assert.equal(calls, 6);
});
