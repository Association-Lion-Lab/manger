const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');
const { spawnSync } = require('node:child_process');

// Only synthetic fixtures are sent to Docker here, never local user data.
const included = ['new-module.js', 'lib/nested/module.js', 'public/index.html', 'public/icons/dish.svg', 'package.json', 'package-lock.json', 'LICENSE'];
const excluded = ['.env', '.env.production', '.npmrc', 'data/manger.db', 'data/accounts.db', 'tls/server.key', 'tls/ca.crt', 'private.pem', 'dump.sqlite-wal', 'backup.zip', 'notes.txt', 'compose.override.yaml', '.git/config', 'docs/prototype.js', 'scripts/local.js', 'node_modules/local.js', 'new-module.test.js', 'public/.env', 'public/token.key', 'public/recovery/save.db', 'public/tests/test.js', 'public/data/local.js', 'lib/.secret.js'];
const directory = mkdtempSync(join(tmpdir(), 'manger-docker-context-'));
try {
  copyFileSync(join(__dirname, '..', '.dockerignore'), join(directory, '.dockerignore'));
  for (const file of [...included, ...excluded]) {
    const target = join(directory, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'synthetic build fixture');
  }
  const assertions = `const fs=require("node:fs"),assert=require("node:assert/strict");
    for(const file of ${JSON.stringify(included)}) assert.ok(fs.existsSync(file),file);
    for(const file of ${JSON.stringify(excluded)}) assert.ok(!fs.existsSync(file),file);`;
  const dockerfile = `FROM node:24-alpine\nWORKDIR /probe\nCOPY . .\nRUN node -e '${assertions}'\n`;
  const result = spawnSync('docker', ['build', '--progress=plain', '-f', '-', directory], { input: dockerfile, encoding: 'utf8', timeout: 180000 });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Docker context check failed');
  console.log('Contexte Docker : nouveaux modules inclus, données et secrets factices exclus.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
