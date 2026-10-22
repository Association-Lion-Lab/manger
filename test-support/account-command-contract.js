const assert=require('node:assert/strict');
const {accountCommand}=require('../accounts');
const {accessHttp}=require('./access-http');

async function commandContract(t,f) {
  const http=await accessHttp(t,f.auth);let admin,owner,member,other;
  await t.test('opérateur explicite seulement : commande et identifiant validés, aucun premier visiteur admin',async()=>{
    assert.equal((await http.request('/api/accounts','POST',{username:'visitor',password:'long-password-visitor',admin:true})).status,401);
    assert.equal(await f.auth.findUser('visitor'),undefined);
    await assert.rejects(()=>accountCommand(f.auth,'unknown','admin'),/Usage/);
    await assert.rejects(()=>accountCommand(f.auth,'create-admin','!bad'),/Identifiant/);
    admin=await accountCommand(f.auth,'create-admin',' ADMIN ');
    assert.equal(admin.username,'admin');assert.match(admin.password,/^[a-zA-Z0-9_-]{24}$/);
    const stored=await f.auth.findUser('admin');assert.equal(stored.admin,1);assert.notEqual(stored.password,admin.password);
    owner=await http.login('admin',admin.password);
    await assert.rejects(()=>accountCommand(f.auth,'create-admin','admin'),/existe déjà/);
  });
  await t.test('récupération membre : même identité et rôle, réactivation et révocation atomique des sessions',async()=>{
    const encoded=(await f.auth.findUser('admin')).password;
    await f.seedMember(encoded);member=await f.auth.findUser('member');
    other=await http.login('member',admin.password);await f.disableMember();
    const reset=await accountCommand(f.auth,'reset-password','member'),current=await f.auth.findUser('member');
    assert.equal(current.id,member.id);assert.equal(current.admin,0);assert.equal(current.active,1);assert.notEqual(current.password,encoded);
    assert.equal((await http.request('/api/account','GET',undefined,other)).status,401);
    assert.equal((await http.request('/api/account','GET',undefined,owner)).status,200);
    other=await http.login('member',reset.password);
    await assert.rejects(()=>accountCommand(f.auth,'reset-password','missing'),/introuvable/);
  });
  await t.test('récupération administrateur : ancien accès révoqué, autres comptes intacts',async()=>{
    const reset=await accountCommand(f.auth,'reset-password','admin');
    assert.equal((await http.request('/api/account','GET',undefined,owner)).status,401);
    assert.equal((await http.request('/api/account','GET',undefined,other)).status,200);
    await http.login('admin',reset.password);assert.equal((await f.auth.findUser('admin')).admin,1);
  });
}
module.exports={commandContract};
