const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

test('répétition instance Docker : secours privé, outils administratifs séparés et volumes distincts',()=>{
  const c=JSON.parse(readFileSync('compose.postgres-rehearsal.yaml','utf8'));
  const pg=c.services['postgres-recovery'],app=c.services['app-recovery'],tools=c.services.instance;
  assert.deepEqual(pg.extends,{file:'compose.postgres.yaml',service:'postgres'});
  assert.equal(pg.volumes[0].source,'recovery-data');assert.equal(pg.volumes[0].target,'/var/lib/postgresql');
  assert.deepEqual(app.extends,{file:'compose.postgres.yaml',service:'app'});
  assert.equal(app.environment.MANGER_PG_HOST,'postgres-recovery');
  assert.equal(app.volumes[0].source,'recovery-runtime');assert.equal(app.volumes[0].target,'/data');
  assert.deepEqual(tools.secrets,['pg_migration_password','pg_ca']);
  assert.deepEqual(tools.networks,['backend']);assert.equal(tools.read_only,true);
  assert.deepEqual(tools.cap_drop,['ALL']);assert.equal(tools.volumes.length,1);
  assert.equal(tools.volumes[0].target,'/archives');assert.equal(tools.volumes[0].bind.create_host_path,false);
  for(const service of Object.values(c.services)){assert.equal(service.ports,undefined);assert.deepEqual(service.profiles,['instance-rehearsal']);}
  for(const volume of Object.values(c.volumes)){assert.equal(volume.external,undefined);assert.equal(volume.name,undefined);assert.ok(volume.labels['org.manger.test-token']);}
});

test('image des outils : dérivée du candidat, client PostgreSQL18 seulement, utilisateur non root',()=>{
  const dockerfile=readFileSync('docker/postgres-tools.Dockerfile','utf8');
  assert.match(dockerfile,/FROM \$\{MANGER_CANDIDATE_IMAGE\}/);
  assert.match(dockerfile,/apk add --no-cache postgresql18-client/);
  assert.match(dockerfile,/USER node/);assert.match(dockerfile,/HEALTHCHECK NONE/);
  assert.match(dockerfile,/MANGER_PG_TOOLS=\/usr\/libexec\/postgresql18/);
  assert.doesNotMatch(dockerfile,/COPY|ADD |apk add[^\n]+(?:postgresql18\s|openssh|curl)/);
  assert.doesNotMatch(readFileSync('Dockerfile','utf8'),/postgresql18-client|postgres-tools/);
});
