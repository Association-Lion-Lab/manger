const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const config = { host:'127.0.0.1',port:5432,user:'test_app',password:'synthetic-password',database:'test_database',ssl:false };

function harness(setup = () => {}) {
  const clients = [], timers = new Set(); let pool;
  class Pool extends EventEmitter {
    constructor(options) { super(); this.options=options; pool=this; setup(this); }
    connect(callback) {
      const acquire = async () => {
        const client = new EventEmitter(); client.sql=[]; client.releases=[];
        client.query = async (sql, values) => { client.sql.push(sql); return this.handle ? this.handle(sql,values,client) : { rows:[{n:1}],command:sql.split(' ')[0] }; };
        client.release = failure => client.releases.push(failure || false);
        clients.push(client);
        if(this.acquire) await this.acquire();
        return client;
      };
      if(callback) { acquire().then(client=>{callback(null,client);this.afterAcquire?.(client);},callback); return; }
      return acquire().then(client=>{this.afterAcquire?.(client);return client;});
    }
    async end() { this.ended=true; }
  }
  const module = { exports:{} };
  vm.runInNewContext(readFileSync(join(__dirname,'db/postgres.js'),'utf8'), {
    require: name => name==='pg' ? { Pool } : require(name), module, exports:module.exports, Buffer,
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn)
  });
  return { ...module.exports,clients,get pool(){return pool;},expire(){for(const fn of [...timers]) fn();} };
}

test('import PostgreSQL sans connexion, configuration explicite et TLS non désactivable à distance', async () => {
  const h=harness(); assert.equal(h.pool,undefined);
  for(const input of [undefined,{}, {...config,host:''},{...config,password:''},{...config,port:0},
    {...config,connectionString:'postgres://invalid'}, {...config,host:'remote.test'},
    {...config,ssl:{rejectUnauthorized:false}}, {...config,ssl:{checkServerIdentity:()=>undefined}}]) {
    await assert.rejects(h.openPostgres(input), candidate=>candidate.code==='POSTGRES_CONFIG');
    assert.equal(h.pool,undefined);
  }
  const db=await h.openPostgres({...config,ssl:{ca:'synthetic-ca'}});
  assert.equal(h.pool.options.ssl.rejectUnauthorized,true);
  assert.equal(h.pool.options.ssl.ca,'synthetic-ca');
  await db.close(); assert.equal(h.pool.ended,true);
});

test('erreur SQL générique sans valeur privée, code conservé et client détruit', async () => {
  const h=harness(), db=await h.openPostgres(config);
  h.pool.handle=async()=>{throw Object.assign(new Error('synthetic-password private SQL'),{code:'23505'});};
  await assert.rejects(db.query('SELECT $1',['private']), error=>{
    assert.equal(error.code,'23505'); assert.doesNotMatch(error.message,/private|synthetic-password/);
    assert.ok(error.cause); return true;
  });
  assert.deepEqual(h.clients.at(-1).releases,[true]); await db.close();
});

test('transaction sur un client réservé, résultat conservé et scope échappé inutilisable', async () => {
  const h=harness(),db=await h.openPostgres(config); let scope;
  assert.equal(await db.transaction(async tx=>{scope=tx;await tx.query('SELECT $1',[1]);return 42;}),42);
  assert.deepEqual(h.clients.at(-1).sql,['BEGIN ISOLATION LEVEL READ COMMITTED','SELECT $1','COMMIT']);
  await assert.rejects(scope.query('SELECT 2'), error=>error.code==='POSTGRES_SCOPE_CLOSED');
  assert.deepEqual(h.clients.at(-1).releases,[false]); await db.close();
});

test('arrêt draine une opération acceptée, refuse les nouvelles et ferme une seule fois', async () => {
  const h=harness(),db=await h.openPostgres(config); let resume,started;
  const ready=new Promise(resolve=>{started=resolve;});
  h.pool.handle=async()=>{started();await new Promise(resolve=>{resume=resolve;});return {rows:[{n:7}]};};
  const query=db.query('SELECT 7'); await ready;
  const close=db.close(); assert.equal(db.state,'closing');
  await assert.rejects(db.query('SELECT 8'),error=>error.code==='POSTGRES_CLOSED');
  assert.equal(h.pool.ended,undefined); resume();
  assert.equal((await query).rows[0].n,7); await close; await db.close();
  assert.equal(db.state,'closed'); assert.equal(h.pool.ended,true);
});

test('arrêt expiré détruit seulement ses clients, rejette le travail et interdit un commit tardif', async () => {
  const h=harness(),db=await h.openPostgres(config); let resume,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const work=db.transaction(async tx=>{await tx.query('SELECT 1');started();await new Promise(resolve=>{resume=resolve;});return 1;});
  const refused=assert.rejects(work,error=>error.code==='POSTGRES_CLOSE_TIMEOUT');
  await ready; const closing=db.close(),timedOut=assert.rejects(closing,error=>error.code==='POSTGRES_CLOSE_TIMEOUT');
  h.expire(); await timedOut; await refused; resume();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(h.clients.at(-1).sql.every(sql=>sql!=='COMMIT'));
  assert.deepEqual(h.clients.at(-1).releases,[true]); assert.equal(h.pool.ended,true);
});

test('une erreur SQL interceptée par le callback impose quand même un rollback', async () => {
  const h=harness(),db=await h.openPostgres(config);
  h.pool.handle=async sql=>{if(sql==='SELECT invalid') throw Object.assign(new Error('private'),{code:'42703'});return {rows:[]};};
  await assert.rejects(db.transaction(async tx=>{try{await tx.query('SELECT invalid');}catch{}return 7;}),error=>error.code==='42703');
  assert.deepEqual(h.clients.at(-1).sql,['BEGIN ISOLATION LEVEL READ COMMITTED','SELECT invalid','ROLLBACK']);
  await db.close();
});

test('même une exception JavaScript sans valeur annule la transaction', async () => {
  const h=harness(),db=await h.openPostgres(config);
  let rejected=false;
  try { await db.transaction(async()=>{throw undefined;}); }
  catch(error) { rejected=true; assert.equal(error,undefined); }
  assert.equal(rejected,true);
  assert.deepEqual(h.clients.at(-1).sql,['BEGIN ISOLATION LEVEL READ COMMITTED','ROLLBACK']);
  await db.close();
});

test('les requêtes démarrées par le callback finissent avant le commit', async () => {
  const h=harness(),db=await h.openPostgres(config); let resume,started;
  const ready=new Promise(resolve=>{started=resolve;});
  h.pool.handle=async sql=>{if(sql==='SELECT delayed'){started();await new Promise(resolve=>{resume=resolve;});}return {rows:[]};};
  const work=db.transaction(async tx=>{tx.query('SELECT delayed');return 3;});
  await ready; assert.ok(!h.clients.at(-1).sql.includes('COMMIT'));
  resume(); assert.equal(await work,3); assert.equal(h.clients.at(-1).sql.at(-1),'COMMIT'); await db.close();
});

test('client réservé perdu pendant un callback inactif : erreur traitée sans commit tardif', async () => {
  const h=harness(),db=await h.openPostgres(config); let resume,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const work=db.transaction(async()=>{started();await new Promise(resolve=>{resume=resolve;});});
  const rejected=assert.rejects(work,error=>error.code==='57P01');
  await ready; const client=h.clients.at(-1);
  client.emit('error',Object.assign(new Error('private host'),{code:'57P01'}));
  await rejected; resume(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(db.lastErrorCode,'57P01'); assert.deepEqual(client.releases,[true]);
  assert.ok(!client.sql.includes('COMMIT')); await db.check(); assert.equal(db.lastErrorCode,null); await db.close();
});

test('acquisition tardive après expiration : aucun SQL, destruction du client, fermeture attendue', async () => {
  const h=harness(),db=await h.openPostgres(config); let acquired;
  h.pool.acquire=()=>new Promise(resolve=>{acquired=resolve;});
  const work=db.query('SELECT never');
  const rejected=assert.rejects(work,error=>error.code==='POSTGRES_CLOSE_TIMEOUT');
  const closing=db.close(),timedOut=assert.rejects(closing,error=>error.code==='POSTGRES_CLOSE_TIMEOUT');
  h.expire(); await new Promise(resolve=>setImmediate(resolve)); assert.equal(h.pool.ended,undefined);
  acquired(); await rejected; await timedOut;
  assert.deepEqual(h.clients.at(-1).sql,[]); assert.deepEqual(h.clients.at(-1).releases,[true]);
  assert.equal(h.pool.ended,true);
});

test('ouverture refusée sans fuite de connexion ou de détails privés et erreur idle observée', async () => {
  const h=harness(pool=>{pool.acquire=async()=>{throw new Error('synthetic-password private host');};});
  await assert.rejects(h.openPostgres(config),error=>{
    assert.doesNotMatch(error.message,/synthetic-password|private/);return error.code==='POSTGRES_QUERY_FAILED';
  });
  assert.equal(h.pool.ended,true);
  const next=harness(),db=await next.openPostgres(config);
  next.pool.emit('error',new Error('private connection')); assert.equal(db.lastErrorCode,'POSTGRES_QUERY_FAILED');
  await db.close();
});

test('coupure immédiatement à la remise du client : surveillance installée avant toute reprise asynchrone', async () => {
  let protectedAtHandoff;
  const h=harness(pool=>{pool.afterAcquire=client=>{
    protectedAtHandoff=client.listenerCount('error')>0;
    client.on('error',()=>{}); // Témoin : l'absence du vrai listener échoue sans tuer le runner.
    client.emit('error',Object.assign(new Error('private handoff'),{code:'57P01'}));
  };});
  await assert.rejects(h.openPostgres(config),error=>error.code==='57P01');
  assert.equal(protectedAtHandoff,true); assert.deepEqual(h.clients[0].sql,[]);
  assert.deepEqual(h.clients[0].releases,[true]); assert.equal(h.pool.ended,true);
});
