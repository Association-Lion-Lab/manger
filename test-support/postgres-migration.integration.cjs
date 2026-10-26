const test=require('node:test'),assert=require('node:assert/strict');
const {databaseFixture}=require('./database');
const {migrationSourceFixture}=require('./migration-source-fixture');
const {analyzeSource}=require('../migration-source');
const {migratePostgres}=require('../migrate-postgres');
const {readPostgresTables,verifyMigration}=require('../migration-verify');
const {postgresAuth}=require('../db/auth');
const {createHash}=require('node:crypto');
test('reprise complète PostgreSQL réel',{timeout:60000},async t=>{
  const f=await databaseFixture(t),source=await analyzeSource(await migrationSourceFixture(t));
  await t.test('transfert de chaque table/valeur, clés, photos et ordre',async()=>{
    const report=await migratePostgres(f.migrationPool,source);assert.equal(report.status,'ready');assert.equal(report.tables,22);assert.doesNotMatch(JSON.stringify(report),/tomate|Café|password|token|username/);
    assert.equal(verifyMigration(source.tables,await readPostgresTables(f.database)).tables,22);
    assert.equal((await f.database.query('SELECT household.storage_status() AS s')).rows[0].s.ready,true);
  });
  await t.test('mêmes sessions actives/expirées et création après recalage',async()=>{
    const auth=postgresAuth(f.database),hash=s=>createHash('sha256').update(s).digest('hex');assert.equal((await auth.session(hash('c'.repeat(64)))).username,'admin');assert.equal(await auth.session(hash('e'.repeat(64))),undefined);
    const next=(await f.database.query("INSERT INTO household.recipes(title,minutes,servings) VALUES('Après',1,1) RETURNING id::float8 AS id")).rows[0].id;assert.equal(next,5000000002);
    assert.equal((await f.database.query("INSERT INTO household.shopping_aisles(name,unit,aisle) VALUES('Après','g','') RETURNING sort_order::float8 AS n")).rows[0].n,10);
    await assert.rejects(migratePostgres(f.migrationPool,source),{code:'MANGER_TRANSFER_INVALID'});
  });
});
