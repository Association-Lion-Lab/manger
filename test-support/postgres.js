const { access, mkdtemp, writeFile, readFile, realpath, lstat, rm } = require('node:fs/promises');
const { join, resolve, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { createServer } = require('node:net');
const { randomBytes } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { Client, Pool } = require('pg');
const execute = promisify(execFile);

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function testBinaries() {
  const directory = resolve(process.env.MANGER_TEST_PG_BIN || join(__dirname, '..', '.test-tools', 'postgresql-18.6-5', 'pgsql', 'bin'));
  const executable = name => join(directory, name + (process.platform === 'win32' ? '.exe' : ''));
  try { for (const name of ['initdb', 'pg_ctl', 'postgres']) await access(executable(name)); }
  catch { throw new Error('PostgreSQL de test absent : prépare les binaires ou indique MANGER_TEST_PG_BIN. Aucun test ignoré.'); }
  const { stdout } = await execute(executable('postgres'), ['--version'], { windowsHide: true, timeout: 5000 });
  if (!/\b18\.6\b/.test(stdout)) throw new Error('Les tests exigent PostgreSQL 18.6 ; aucune autre instance ne sera utilisée.');
  return executable;
}

async function postgresFixture(t) {
  const executable = await testBinaries(), parent = await realpath(tmpdir());
  const directory = await mkdtemp(join(parent, 'manger-pg-test-')), data = join(directory, 'data');
  const nonce = randomBytes(32).toString('hex'), marker = join(directory, '.manger-test-owner');
  await writeFile(marker, nonce, { mode: 0o600 });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
  let pool, migrationPool, closing;

  async function owned() {
    if (dirname(directory) !== parent || !basename(directory).startsWith('manger-pg-test-') ||
        (await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory ||
        await readFile(marker, 'utf8') !== nonce) throw new Error('Ressource PostgreSQL non reconnue : opération refusée.');
  }
  async function control(command) {
    await owned();
    const entry = await lstat(data).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (entry && (entry.isSymbolicLink() || await realpath(data) !== data)) throw new Error('Répertoire PostgreSQL détourné : opération refusée.');
    // No inherited pipe can keep a Windows pg_ctl invocation alive after it exits.
    return new Promise((resolve, reject) => {
      const child = spawn(executable('pg_ctl'), [...command, '-D', data], { cwd: directory, env, windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => child.kill(), 20000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(Object.assign(new Error(`pg_ctl ${command[0]} a échoué (${signal || code}).`), { code }));
      });
    });
  }
  async function running() {
    try { await control(['status']); return true; }
    catch (error) { if ([3, 4].includes(error.code)) return false; throw error; }
  }
  async function stop() {
    if (await running()) await control(['stop', '-m', 'fast', '-w', '-t', '15']);
  }
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      let timer, poolError;
      try {
        await Promise.race([Promise.all([pool, migrationPool].filter(item=>item&&!item.ended).map(item => item.end())), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Fermeture du pool de test trop longue.')), 3000);
        })]);
      } catch (error) { poolError = error; }
      finally { clearTimeout(timer); }
      await stop();
      await owned();
      // Windows may retain a directory handle briefly after the owned cluster exits.
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      if (poolError) throw poolError;
    })();
    return closing;
  }
  t.after(close);

  const port = await freePort();
  async function start() {
    try {
      await control(['start', '-l', join(directory, 'server.log'), '-w', '-t', '15', '-o',
        `-h 127.0.0.1 -p ${port} -c unix_socket_directories= -c shared_buffers=16MB -c max_connections=20 -c log_statement=none -c log_min_error_statement=panic`]);
    } catch (error) {
      const log = await readFile(join(directory, 'server.log'), 'utf8').catch(() => 'Journal indisponible.');
      throw new Error(`Démarrage PostgreSQL de test refusé : ${log.slice(-4000).replace(/[a-f0-9]{64}/gi, '[secret]')}`, { cause: error });
    }
  }
  const config = { host: '127.0.0.1', port, ssl: false, connectionTimeoutMillis: 2000, query_timeout: 3000, statement_timeout: 1000, application_name: 'manger-local-test' };
  try {
    const passwordFile = join(directory, '.bootstrap-password'), ownerPassword = randomBytes(32).toString('hex');
    await writeFile(passwordFile, ownerPassword + '\n', { mode: 0o600 });
    await execute(executable('initdb'), ['-D', data, '-U', 'manger_test_owner', '--encoding=UTF8', '--locale=C',
      '--auth=scram-sha-256', '--no-instructions', `--pwfile=${passwordFile}`], { cwd: directory, env, windowsHide: true, timeout: 30000 });
    await rm(passwordFile);
    await start();
    const admin = new Client({ ...config, user: 'manger_test_owner', password: ownerPassword, database: 'postgres' });
    const password = randomBytes(32).toString('hex'), migrationPassword = randomBytes(32).toString('hex');
    try {
      await admin.connect();
      for (const [name, secret] of [['manger_test_app', password], ['manger_test_migrator', migrationPassword]]) {
        const { rows: [role] } = await admin.query("SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', $1::text, $2::text) AS sql", [name, secret]);
        await admin.query(role.sql);
      }
      // Cloning template0 touches disk; this setup deadline is not the application query budget.
      await admin.query('SET statement_timeout=15000');
      try { await admin.query({text:'CREATE DATABASE manger_test OWNER manger_test_migrator TEMPLATE template0',query_timeout:20000}); }
      finally { await admin.query('SET statement_timeout=1000'); }
      await admin.query('REVOKE ALL ON DATABASE manger_test FROM PUBLIC; GRANT CONNECT ON DATABASE manger_test TO manger_test_app');
    } finally { await admin.end(); }
    pool = new Pool({ ...config, user: 'manger_test_app', password, database: 'manger_test', max: 4, idleTimeoutMillis: 500 });
    migrationPool = new Pool({ ...config, user: 'manger_test_migrator', password: migrationPassword, database: 'manger_test', max: 2, idleTimeoutMillis: 500 });
    const connectionErrors = [];
    for (const item of [pool, migrationPool]) item.on('error', error => connectionErrors.push(error.code || 'CONNECTION_ERROR'));
    await migrationPool.query('REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO manger_test_app');
    await pool.query('SELECT 1');
    return { pool, migrationPool, directory, port, start, stop, close, connectionErrors };
  } catch (error) {
    try { await close(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'Échec de préparation et de nettoyage PostgreSQL local.'); }
    throw error;
  }
}

module.exports = { postgresFixture };
