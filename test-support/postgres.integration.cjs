const test = require('node:test');
const assert = require('node:assert/strict');
const { access, readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { createServer } = require('node:net');
const { Client } = require('pg');
const { postgresFixture } = require('./postgres');

test('PostgreSQL de test : serveur privé, droits, requêtes bornées et nettoyage', { timeout: 90000 }, async t => {
  const fixture = await postgresFixture(t);
  await t.test('le propriétaire de migration est distinct et inaccessible au rôle applicatif', async () => {
    assert.ok(fixture.migrationPool, 'Pool de migration requis');
    assert.equal((await fixture.migrationPool.query('SELECT current_user AS name')).rows[0].name, 'manger_test_migrator');
    const { rows: [rights] } = await fixture.pool.query(`SELECT
      has_database_privilege(current_user, current_database(), 'CREATE') AS create_db_object,
      has_database_privilege(current_user, current_database(), 'TEMP') AS temp,
      has_schema_privilege(current_user, 'public', 'CREATE') AS create_public`);
    assert.deepEqual(rights, { create_db_object: false, temp: false, create_public: false });
    await assert.rejects(fixture.pool.query('SET ROLE manger_test_migrator'), { code: '42501' });
    await assert.rejects(fixture.pool.query('CREATE TABLE public.forbidden(id integer)'), { code: '42501' });
  });
  await t.test('serveur réel 18.6 sur loopback et rôle sans privilèges serveur', async () => {
    const { rows: [role] } = await fixture.pool.query(`SELECT current_user AS name,
      host(inet_server_addr()) AS host, current_setting('server_version') AS version,
      rolsuper, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname=current_user`);
    assert.equal(role.name, 'manger_test_app'); assert.equal(role.host, '127.0.0.1');
    assert.match(role.version, /^18\.6(?:\D|$)/);
    for (const key of ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication']) assert.equal(role[key], false);
    await assert.rejects(fixture.pool.query('CREATE ROLE forbidden_test_role'), { code: '42501' });
    await assert.rejects(fixture.pool.query('CREATE DATABASE forbidden_test_database'), { code: '42501' });
  });
  await t.test('paramètres, Unicode, octets NUL et rollback sur un client réservé', async () => {
    await fixture.migrationPool.query('CREATE TABLE public.probe(id integer PRIMARY KEY, label text NOT NULL, bytes bytea NOT NULL)');
    await fixture.migrationPool.query('GRANT SELECT, INSERT ON public.probe TO manger_test_app');
    const label = "Œuf 🥣 '; DROP TABLE probe; --", bytes = Buffer.from([0, 255, 0, 127]);
    await fixture.pool.query('INSERT INTO probe VALUES ($1,$2,$3)', [1, label, bytes]);
    const { rows: [saved] } = await fixture.pool.query('SELECT * FROM probe WHERE id=$1', [1]);
    assert.deepEqual(saved, { id: 1, label, bytes });
    const client = await fixture.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO probe VALUES ($1,$2,$3)', [2, 'annulé', bytes]);
      await client.query('ROLLBACK');
    } finally { client.release(); }
    assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM probe')).rows[0].n, 1);
  });
  await t.test('une requête trop longue est annulée sans rendre le pool inutilisable', async () => {
    await assert.rejects(fixture.pool.query('SELECT pg_sleep(5)'), { code: '57014' });
    assert.equal((await fixture.pool.query('SELECT 1 AS n')).rows[0].n, 1);
  });
  await t.test('une connexion sans réponse expire sans utiliser un service extérieur', async () => {
    const sockets = new Set(), blackhole = createServer(socket => sockets.add(socket));
    await new Promise(resolve => blackhole.listen(0, '127.0.0.1', resolve));
    const client = new Client({ host: '127.0.0.1', port: blackhole.address().port, user: 'unused_test',
      database: 'unused_test', password: 'synthetic-unused', ssl: false, connectionTimeoutMillis: 150 });
    try { await assert.rejects(client.connect(), /timeout/i); }
    finally {
      await client.end();
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => blackhole.close(resolve));
    }
  });
  await t.test('un marqueur modifié interdit de stopper une ressource non reconnue', async () => {
    const marker = join(fixture.directory, '.manger-test-owner'), original = await readFile(marker);
    try {
      await writeFile(marker, 'not-the-owner');
      await assert.rejects(fixture.stop(), /non reconnue/);
    } finally { await writeFile(marker, original); }
    assert.equal((await fixture.pool.query('SELECT 1 AS n')).rows[0].n, 1);
  });
  await t.test('arrêt et reprise du serveur conservent les données de la fixture', async () => {
    await fixture.stop();
    await assert.rejects(fixture.pool.query('SELECT 1'));
    await fixture.start();
    assert.equal((await fixture.pool.query('SELECT id FROM probe')).rows[0].id, 1);
    assert.equal(fixture.pool.totalCount, fixture.pool.idleCount);
    for (const code of fixture.connectionErrors) assert.ok(['57P01', 'ECONNRESET', 'EPIPE'].includes(code), code);
  });
  await fixture.close();
  await assert.rejects(access(fixture.directory), { code: 'ENOENT' });
  await fixture.close(); // Cleanup is idempotent, including the t.after hook.
});
