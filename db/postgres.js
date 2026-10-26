const { Pool } = require('pg');

function failure(code, cause) {
  const error = new Error('Opération PostgreSQL impossible.', cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function databaseError(error) {
  const code = /^[A-Z0-9]{5}$/.test(error?.code) ? error.code : 'POSTGRES_QUERY_FAILED';
  return failure(code, error);
}

function tlsOptions(host, ssl) {
  if (ssl === false && ['127.0.0.1', '::1'].includes(host)) return false;
  if (ssl === undefined || ssl === true) return { rejectUnauthorized: true };
  if (!ssl || typeof ssl !== 'object' || Array.isArray(ssl)) throw failure('POSTGRES_CONFIG');
  if (Object.keys(ssl).some(key => !['ca', 'rejectUnauthorized'].includes(key))) throw failure('POSTGRES_CONFIG');
  if (ssl.rejectUnauthorized !== undefined && ssl.rejectUnauthorized !== true) throw failure('POSTGRES_CONFIG');
  if (ssl.ca !== undefined && (typeof ssl.ca !== 'string' || !ssl.ca.trim())) throw failure('POSTGRES_CONFIG');
  return { rejectUnauthorized: true, ...(ssl.ca === undefined ? {} : { ca: ssl.ca }) };
}

function poolOptions(config) {
  const keys = ['host', 'port', 'user', 'password', 'database', 'ssl'];
  if (!config || typeof config !== 'object' || Object.keys(config).some(key => !keys.includes(key))) throw failure('POSTGRES_CONFIG');
  for (const key of ['host', 'user', 'password', 'database']) {
    if (typeof config[key] !== 'string' || !config[key].trim() || config[key].includes('\0')) throw failure('POSTGRES_CONFIG');
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw failure('POSTGRES_CONFIG');
  return {
    host: config.host, port: config.port, user: config.user, password: config.password, database: config.database,
    ssl: tlsOptions(config.host, config.ssl), sslnegotiation: 'postgres', client_encoding: 'UTF8',
    options: '-c search_path=pg_catalog', application_name: 'manger', max: 4,
    connectionTimeoutMillis: 2000, query_timeout: 3000, statement_timeout: 2000,
    idle_in_transaction_session_timeout: 10000
  };
}

function clientLease(client, onError) {
  let alive = true, scopeOpen = true, failed = false, queryError, rejectCancellation;
  const pending = new Set();
  const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
  function cancel(error) {
    if (!alive) return;
    alive = false; failed = true;
    rejectCancellation(error);
  }
  const clientError = error => { onError(error); cancel(databaseError(error)); };
  client.on('error', clientError);

  async function execute(sql, values = []) {
    if (!alive) throw failure('POSTGRES_SCOPE_CLOSED');
    if (typeof sql !== 'string' || !sql.trim() || !Array.isArray(values)) throw failure('POSTGRES_QUERY_INPUT');
    try { return await client.query(sql, values); }
    catch (error) { failed = true; throw databaseError(error); }
  }
  function query(sql, values) {
    if (!scopeOpen || !alive) return Promise.reject(failure('POSTGRES_SCOPE_CLOSED'));
    const operation = execute(sql, values);
    pending.add(operation);
    operation.then(() => pending.delete(operation), error => { queryError ||= error; pending.delete(operation); });
    return operation;
  }
  async function settle() {
    scopeOpen = false;
    await Promise.allSettled([...pending]);
  }
  function release(destroy) {
    alive = false; scopeOpen = false;
    client.off('error', clientError);
    client.release(Boolean(destroy || failed));
  }
  return { query, execute, settle, cancel, cancelled, release, get queryError() { return queryError; } };
}

async function runTransaction(lease, work) {
  if (typeof work !== 'function') throw failure('POSTGRES_TRANSACTION_INPUT');
  await lease.execute('BEGIN ISOLATION LEVEL READ COMMITTED');
  let result, error, aborted = false;
  try { result = await work(Object.freeze({ query: lease.query })); }
  catch (cause) { error = cause; aborted = true; }
  await lease.settle();
  if (!aborted && lease.queryError) { error = lease.queryError; aborted = true; }
  if (aborted) {
    try { await lease.execute('ROLLBACK'); }
    catch (cause) { throw failure('POSTGRES_ROLLBACK_FAILED', new AggregateError([error, cause])); }
    throw error;
  }
  return lease.execute('COMMIT').then(() => result);
}

function connectionPool(pool) {
  let state = 'open', closing, forced = false, lastErrorCode = null;
  const operations = new Set(), leases = new Set();
  const recordError = error => { lastErrorCode = databaseError(error).code; };
  pool.on('error', recordError);

  function acquire() {
    return new Promise((resolve, reject) => {
      // Install the client listener inside pg's synchronous handoff, before yielding.
      pool.connect((error, client) => {
        if (error) { recordError(error); reject(databaseError(error)); return; }
        if (forced) { client.release(true); reject(failure('POSTGRES_CLOSE_TIMEOUT')); return; }
        const lease = clientLease(client, recordError);
        leases.add(lease); resolve(lease);
      });
    });
  }
  async function useClient(work) {
    const lease = await acquire();
    let failed = false;
    try { return await Promise.race([Promise.resolve().then(() => work(lease)), lease.cancelled]); }
    catch (error) { failed = true; throw error; }
    finally { leases.delete(lease); lease.release(failed); }
  }
  function submit(work) {
    if (state !== 'open') return Promise.reject(failure('POSTGRES_CLOSED'));
    const operation = useClient(work);
    operations.add(operation);
    operation.then(() => operations.delete(operation), () => operations.delete(operation));
    return operation;
  }
  async function drain() {
    const accepted = [...operations];
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(() => resolve(false), 5000); });
    const completed = await Promise.race([Promise.allSettled(accepted).then(() => true), deadline]);
    clearTimeout(timer);
    if (!completed) {
      forced = true;
      for (const lease of leases) lease.cancel(failure('POSTGRES_CLOSE_TIMEOUT'));
      await Promise.allSettled(accepted);
    }
    try { await pool.end(); }
    finally { state = 'closed'; }
    if (forced) throw failure('POSTGRES_CLOSE_TIMEOUT');
  }
  function close() {
    if (!closing) { state = 'closing'; closing = drain(); }
    return closing;
  }
  const query = (sql, values) => submit(lease => lease.execute(sql, values));
  async function check() {
    await query('SELECT 1');
    lastErrorCode = null;
  }
  return Object.freeze({ query, transaction: work => submit(lease => runTransaction(lease, work)), check, close,
    get state() { return state; }, get lastErrorCode() { return lastErrorCode; } });
}

async function openPostgres(config) {
  const database = connectionPool(new Pool(poolOptions(config)));
  try { await database.check(); return database; }
  catch (error) {
    try { await database.close(); }
    catch (cause) { throw failure('POSTGRES_OPEN_FAILED', new AggregateError([error, cause])); }
    throw error;
  }
}

function reservePostgresClient(pool){
  return new Promise((resolve,reject)=>{
    try{pool.connect((error,client)=>{
      if(error){reject(databaseError(error));return;}
      const lease=clientLease(client,()=>{});lease.cancelled.catch(()=>{});
      resolve(Object.freeze({query:(sql,values)=>Promise.race([lease.query(sql,values),lease.cancelled]),release:()=>lease.release(true)}));
    });}catch(error){reject(databaseError(error));}
  });
}
module.exports = { openPostgres, poolOptions, reservePostgresClient };
