const assert = require('node:assert/strict');
const { controlledAccounts, within } = require('./auth-races');
const { accessHttp } = require('./access-http');

async function accessRaces(t,f) {
  const controlled=controlledAccounts(); t.after(()=>controlled.releaseAll());
  await t.test('perte du rôle administrateur pendant scrypt interdit la création',async context=>{
    await f.clearAttempts();const http=await accessHttp(context,f.auth,controlled.protectAccounts),owner=await http.login();
    const gate=controlled.pauseNextHash(),work=http.request('/api/accounts','POST',{username:'denied',password:'long-password-created',admin:true},owner);
    try {await within(gate.ready);await f.setAdmin(false);gate.open();assert.equal((await work).status,403);assert.equal(await f.auth.findUser('denied'),undefined);}
    finally {gate.open();await f.setAdmin(true);await work;}
  });
  await t.test('lien annulé pendant scrypt : pas de compte ni de session créée',async context=>{
    await f.clearAttempts();const http=await accessHttp(context,f.auth,controlled.protectAccounts),owner=await http.login(),{token}=await http.issue(owner);
    const gate=controlled.pauseNextHash(),work=http.request('/api/account/join','POST',{token,username:'revoked',password:'long-password-invitee'});
    try {
      await within(gate.ready);assert.equal((await http.request('/api/accounts/invitation','DELETE',{},owner)).status,200);
      gate.open();const response=await work;assert.equal(response.status,400);assert.equal(response.headers.get('set-cookie'),null);
      assert.equal(await f.auth.findUser('revoked'),undefined);
    } finally {gate.open();await work;}
  });
  await t.test('lien expiré pendant scrypt : inscription refusée',async context=>{
    await f.clearAttempts();const http=await accessHttp(context,f.auth,controlled.protectAccounts),owner=await http.login(),{token}=await http.issue(owner);
    const gate=controlled.pauseNextHash(),work=http.request('/api/account/join','POST',{token,username:'expired',password:'long-password-invitee'});
    try {await within(gate.ready);await f.expireInvitations();gate.open();assert.equal((await work).status,400);assert.equal(await f.auth.findUser('expired'),undefined);}
    finally {gate.open();await work;}
  });
  await t.test('garde SMTP réservée avant attente SQL puis libérée après refus',async context=>{
    let entered,release,first=true;
    const ready=new Promise(resolve=>{entered=resolve;}),wait=new Promise(resolve=>{release=resolve;});context.after(()=>release());
    const auth={...f.auth,async prepareMail(...args){if(first){first=false;entered();await wait;return 'forbidden';}return f.auth.prepareMail(...args);}};
    await f.clearAttempts();const http=await accessHttp(context,auth),owner=await http.login(),{token}=await http.issue(owner);
    const send=()=>http.request('/api/accounts/invitation/email','POST',{token,to:'personne@example.org'},owner),work=send();
    try {await within(ready);assert.equal((await send()).status,429);release();assert.equal((await work).status,403);assert.equal((await send()).status,200);assert.equal(http.sent.length,1);}
    finally {release();await work;}
  });
  await t.test('erreur interne de réservation : aucun secret ni envoi, garde libérée',async context=>{
    let fail=true;
    const auth={...f.auth,async prepareMail(...args){if(fail){fail=false;throw new Error('synthetic-private-password SELECT auth.invitations');}return f.auth.prepareMail(...args);}};
    await f.clearAttempts();const http=await accessHttp(context,auth),owner=await http.login(),{token}=await http.issue(owner);
    const send=()=>http.request('/api/accounts/invitation/email','POST',{token,to:'personne@example.org'},owner);
    const response=await send();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/synthetic-private|SELECT|auth.invitations/);
    assert.equal(http.sent.length,0);assert.equal((await send()).status,200);
  });
}
module.exports={accessRaces};
