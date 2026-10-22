const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createRequire } = require('node:module');
const vm = require('node:vm');

function controlledAccounts() {
  const directory=join(__dirname,'..'), localRequire=createRequire(join(directory,'accounts.js'));
  let next;
  const held=new Set(), module={exports:{}};
  function pauseNextHash() {
    let entered, release;
    const ready=new Promise(resolve=>{entered=resolve;});
    const wait=new Promise(resolve=>{release=resolve;});
    const open=()=>{held.delete(open);release();}; held.add(open);
    next={entered,wait}; return {ready,open};
  }
  function scrypt(...args) {
    const callback=args.pop();
    crypto.scrypt(...args,(error,key)=>{
      const gate=next; next=null;
      if (!gate) return callback(error,key);
      gate.entered(); gate.wait.then(()=>callback(error,key));
    });
  }
  vm.runInNewContext(readFileSync(join(directory,'accounts.js'),'utf8'),{
    require:name=>name==='node:crypto'?{...crypto,scrypt}:localRequire(name),module,exports:module.exports,
    __dirname:directory,Buffer,URL,process
  });
  return {...module.exports,pauseNextHash,releaseAll(){for(const open of held)open();}};
}

async function within(work) {
  let timer;
  try { return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('barrière de test non atteinte')),2000);})]); }
  finally { clearTimeout(timer); }
}

async function raceContract(t, f) {
  const controlled=controlledAccounts(); t.after(()=>controlled.releaseAll());
  async function serve(context,auth=f.auth) {
    const server=createServer(controlled.protectAccounts(null,(_req,res)=>{res.writeHead(404);res.end();},{auth}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    context.after(()=>{controlled.releaseAll();server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
    const base=`http://127.0.0.1:${server.address().port}`;
    const post=(path,body,cookie)=>fetch(base+path,{method:'POST',signal:AbortSignal.timeout(5000),headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
    const login=()=>post('/api/account/login',{username:'admin',password:'long-password-admin'});
    return {post,login};
  }
  await t.test('désactivation pendant la vérification scrypt interdit la nouvelle session',async context=>{
    await f.clearAttempts(); const http=await serve(context),gate=controlled.pauseNextHash();
    const work=http.login();
    try { await within(gate.ready); await f.setActive(false); gate.open(); assert.equal((await work).status,401); }
    finally { gate.open(); await f.setActive(true); await work; }
  });
  await t.test('réinitialisation pendant scrypt invalide le hachage lu avant la pause',async context=>{
    await f.clearAttempts(); const original=await f.readPassword(),http=await serve(context),gate=controlled.pauseNextHash();
    const work=http.login();
    try {
      await within(gate.ready); await f.setPassword(original.slice(0,-1)+(original.endsWith('0')?'1':'0'));
      gate.open(); assert.equal((await work).status,401);
    } finally { gate.open(); await f.setPassword(original); await work; }
  });
  await t.test('révocation pendant scrypt refuse le changement de mot de passe',async context=>{
    await f.clearAttempts(); const original=await f.readPassword(),http=await serve(context),login=await http.login();
    assert.equal(login.status,200); const cookie=login.headers.get('set-cookie').split(';')[0];
    const gate=controlled.pauseNextHash(),work=http.post('/api/account/password',{current:'long-password-admin',password:'must-not-apply-password'},cookie);
    try { await within(gate.ready); await f.revokeSessions(); gate.open(); assert.equal((await work).status,401); assert.equal(await f.readPassword(),original); }
    finally { gate.open(); await work; }
  });
  await t.test('deux places réservées avant un throttle asynchrone : troisième requête refusée',async context=>{
    await f.clearAttempts(); let entered,release,count=0;
    const ready=new Promise(resolve=>{entered=resolve;}),wait=new Promise(resolve=>{release=resolve;});
    context.after(()=>release());
    const http=await serve(context,{...f.auth,async throttle(){if(++count===2)entered();await wait;return true;}});
    const first=http.login(),second=http.login();
    try { await within(ready); assert.equal((await http.login()).status,429); assert.equal(count,2); }
    finally { release(); await Promise.all([first,second]); }
  });
  if (f.auth.engine==='postgres') await t.test('erreur interne sans code masquée et aucune réussite/cookie annoncée',async context=>{
    const http=await serve(context,{...f.auth,async findUser(){throw new Error('synthetic-private-password SELECT auth.accounts host');}});
    const response=await http.login(); assert.equal(response.status,503); assert.equal(response.headers.get('set-cookie'),null);
    assert.doesNotMatch(await response.text(),/synthetic-private|SELECT|auth.accounts|host/);
    assert.throws(()=>controlled.protectAccounts({},()=>{},{auth:f.auth}),/un seul stockage/);
  });
}

module.exports = { raceContract, controlledAccounts, within };
