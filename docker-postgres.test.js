const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
test('Compose candidat : volumes propres, PostgreSQL privé et aucun secret propriétaire web',()=>{
  const c=JSON.parse(readFileSync('compose.postgres.yaml','utf8'));
  assert.notEqual(c.name,'manger');
  const app=c.services.app,pg=c.services.postgres,admin=c.services.migrate;
  assert.equal(app.environment.MANGER_POSTGRES_CANDIDATE,'1');assert.equal(app.environment.MANGER_PG_TLS,'verify-full');
  assert.deepEqual(app.secrets,['pg_app_password','pg_ca']);assert.deepEqual(admin.secrets,['pg_migration_password','pg_ca']);assert.deepEqual(admin.profiles,['maintenance']);
  for(const service of Object.values(c.services))assert.equal(service.ports,undefined);
  assert.deepEqual(Object.keys(pg.networks),['backend']);assert.equal(c.networks.backend.internal,true);
  assert.match(pg.image,/^postgres:18\.6-bookworm@sha256:[a-f0-9]{64}$/);
  assert.equal(pg.environment.PGDATA,'/var/lib/postgresql/18/docker');assert.ok(pg.volumes.some(v=>v.source==='postgres-data'&&v.target==='/var/lib/postgresql'));
  for(const volume of Object.values(c.volumes)){assert.equal(volume.external,undefined);assert.equal(volume.name,undefined);assert.match(volume.labels['org.manger.test-token'],/MANGER_TEST_TOKEN/);}
  assert.equal(app.read_only,true);assert.deepEqual(app.cap_drop,['ALL']);
  assert.doesNotMatch(JSON.stringify(c),/manger-data|MANGER_PG_TLS.*disable-local/);
  const patterns=readFileSync('.dockerignore','utf8').split(/\r?\n/);for(const name of ['**/docker','**/docker/**'])assert.ok(patterns.indexOf(name)>patterns.indexOf('!**/*.js'));
});
