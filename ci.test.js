const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const workflow=()=>JSON.parse(fs.readFileSync('.forgejo/workflows/docker.yaml','utf8'));

test('CI : deux moteurs requis avant la construction et les deux scénarios Docker',()=>{
  const w=workflow(),tests=w.jobs.tests,image=w.jobs.docker;
  assert.deepEqual(tests.strategy.matrix.storage,['sqlite','postgres']);
  assert.deepEqual(image.needs,['tests']);
  const commands=tests.steps.map(s=>s.run||'').join('\n');
  assert.match(commands,/sqlite\) npm test/);assert.match(commands,/postgres\) npm run test:postgres/);
  assert.match(commands,/MANGER_TEST_PG_BIN/);
  const docker=image.steps.map(s=>s.run||'').join('\n');
  for(const required of ['npm audit --omit=dev --audit-level=high','node scripts/check-docker-context.js','docker build --pull','sh scripts/test-docker.sh','sh scripts/test-postgres-image.sh'])assert.ok(docker.includes(required),required);
  assert.ok(docker.includes('docker/postgres-tools.Dockerfile'));
  assert.ok(docker.includes('sh scripts/test-postgres-image.sh "$CI_IMAGE" "$CI_IMAGE-tools" --admin-https'));
});

test('CI : erreurs bloquantes, checkout figé et aucun déploiement ou artefact privé',()=>{
  const w=workflow();assert.deepEqual(w.on.push.branches,['development','main']);
  assert.equal(w.on.pull_request_target,undefined);assert.equal(w.on.pull_request,undefined);
  for(const job of Object.values(w.jobs)){
    assert.equal(job['runs-on'],'manger-docker');assert.equal(job['continue-on-error'],undefined);
    const checkout=job.steps.find(step=>step.uses);assert.match(checkout.uses,/^https:\/\/github.com\/actions\/checkout@[a-f0-9]{40}$/);
    assert.equal(checkout.with['persist-credentials'],false);
    for(const step of job.steps){
      assert.equal(step['continue-on-error'],undefined);
      if(step.run){assert.match(step.run,/^set -eu\n/);assert.doesNotMatch(step.run,/\|\|\s*(?:true|:)|docker\s+(?:push|system\s+prune)|docker compose.+down.+-v|ssh\s|upload-artifact/);}
    }
  }
});
