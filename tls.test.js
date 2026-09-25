const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const { X509Certificate } = require('node:crypto');
const { tlsOptions } = require('./tls');
const { healthcheck } = require('./healthcheck');
const { createLocalTls } = require('./create-local-tls');
const { createApp, createDatabase } = require('./server');
const { createAccount, openAccounts } = require('./accounts');

test('TLS configuration is optional but incomplete or invalid configuration fails closed', () => {
  assert.equal(tlsOptions({}), null);
  assert.throws(() => tlsOptions({MANGER_TLS_CERT:'missing'}), /ensemble/);
  assert.throws(() => tlsOptions({MANGER_TLS_KEY:'missing'}), /ensemble/);
  assert.throws(() => tlsOptions({MANGER_TLS_KEY:'missing',MANGER_TLS_CERT:'missing'}), /ENOENT/);
  assert.throws(() => createLocalTls('192.0.2.1, DNS:evil.test', 'unused'), /adresse IP/);
});

test('Docker healthcheck still works in default HTTP mode and rejects failed health', async () => {
  let status = 200;
  const server = require('node:http').createServer((req,res) => { assert.equal(req.url,'/api/health'); res.writeHead(status); res.end('{}'); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const env = { MANGER_PORT: String(server.address().port) };
    await healthcheck(env); status = 503;
    await assert.rejects(healthcheck(env), /503/);
    await assert.rejects(healthcheck({...env,MANGER_TLS_CERT:'missing'}), /incomplète/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('HTTPS validates local CA, preserves authentication and Secure cookies, healthcheck rejects untrusted certificates', async t => {
  const openssl = process.env.OPENSSL || 'openssl';
  try { execFileSync(openssl,['version'],{stdio:'pipe'}); } catch { t.skip('OpenSSL requis : installer openssl ou définir OPENSSL pour ce test HTTPS.'); return; }
  const folder=mkdtempSync(join(tmpdir(),'manger-tls-test-'));
  const data=createDatabase(':memory:'), accounts=openAccounts(':memory:');let server;
  try {
    const destination=join(folder,'tls'); const generated=createLocalTls('127.0.0.1',destination,openssl);
    const ca=readFileSync(join(destination,'ca.crt'));
    const root=new X509Certificate(ca), leaf=new X509Certificate(readFileSync(join(destination,'server/server.crt')));
    assert.equal(root.ca,true);assert.equal(leaf.ca,false);assert.equal(leaf.verify(root.publicKey),true);assert.ok(leaf.checkIP('127.0.0.1'));assert.ok(leaf.checkHost('localhost'));
    assert.equal(generated.fingerprint,root.fingerprint256);
    assert.throws(()=>createLocalTls('127.0.0.1',destination,openssl),/EEXIST/);
    assert.deepEqual(readFileSync(join(destination,'ca.crt')),ca);
    const env={MANGER_TLS_CERT:join(destination,'server/server.crt'),MANGER_TLS_KEY:join(destination,'server/server.key'),MANGER_TLS_CA:join(destination,'ca.crt')};
    await createAccount(accounts,'admin','testing-https-password',true);
    server=createApp(data,undefined,undefined,accounts,tlsOptions(env));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=server.address().port;env.MANGER_PORT=String(port);
    const request=(path,{method='GET',body,cookie,origin=`https://127.0.0.1:${port}`}={})=>new Promise((resolve,reject)=>{
      const req=require('node:https').request({host:'127.0.0.1',port,path,method,ca,agent:false,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
    });
    assert.equal((await request('/api/household')).status,401);
    const login=await request('/api/account/login',{method:'POST',body:{username:'admin',password:'testing-https-password'}});
    assert.equal(login.status,200);assert.match(login.headers['set-cookie'][0],/; Secure/);
    const cookie=login.headers['set-cookie'][0].split(';')[0];
    assert.equal((await request('/api/household',{cookie})).status,200);
    assert.equal((await request('/api/account/logout',{method:'POST',body:{},cookie,origin:`http://127.0.0.1:${port}`})).status,403);
    await healthcheck(env);
    await assert.rejects(healthcheck({...env,MANGER_TLS_CA:undefined}));
    assert.equal((await request('/api/account/logout',{method:'POST',body:{},cookie})).status,200);
    assert.equal((await request('/api/household',{cookie})).status,401);
  } finally {if(server?.listening)await new Promise(resolve=>server.close(resolve));data.close();accounts.close();rmSync(folder,{recursive:true,force:true});}
});
