const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('profil administrateur PostgreSQL : HTTPS obligatoire, accès local par défaut et outils séparés',()=>{
  const c=JSON.parse(fs.readFileSync('compose.postgres.instance.yaml','utf8'));
  const app=c.services.app,pg=c.services.postgres,tools=c.services.instance;
  assert.equal(c.name,'manger-postgres-instance');assert.equal(app.restart,'unless-stopped');assert.equal(pg.restart,'unless-stopped');
  assert.deepEqual(app.secrets,['web_tls_cert','web_tls_key','web_tls_ca']);
  assert.equal(app.environment.MANGER_TLS_CERT,'/run/secrets/web_tls_cert');
  assert.equal(app.environment.MANGER_TLS_KEY,'/run/secrets/web_tls_key');
  assert.equal(app.environment.MANGER_TLS_CA,'/run/secrets/web_tls_ca');
  assert.match(app.ports[0],/127\.0\.0\.1/);assert.match(app.ports[0],/MANGER_INSTANCE_PORT:-3000/);
  assert.deepEqual(tools.profiles,['maintenance']);assert.deepEqual(tools.secrets,['pg_migration_password','pg_ca']);
  assert.deepEqual(tools.networks,['backend']);assert.equal(tools.read_only,true);assert.deepEqual(tools.cap_drop,['ALL']);
  assert.equal(tools.volumes[0].target,'/archives');assert.equal(tools.volumes[0].bind.create_host_path,false);
  assert.equal(c.volumes,undefined);assert.equal(pg.ports,undefined);
  for(const secret of Object.values(c.secrets))assert.match(secret.file,/MANGER_WEB_TLS_DIR:\?/);
  assert.doesNotMatch(JSON.stringify(c),/ca\.key|external|manger-data|disable-local/);
});

test('test du profil administrateur : les réglages SMTP privés ne sont pas hérités',()=>{
  const script=fs.readFileSync('scripts/test-postgres-image.sh','utf8');
  for(const name of ['MANGER_SMTP_HOST','MANGER_SMTP_FROM','MANGER_SMTP_USER','MANGER_SMTP_PASSWORD','MANGER_APP_URL'])assert.ok(script.includes(name+"=''"),name);
});
