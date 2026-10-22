const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, readdirSync, cpSync, mkdtempSync, rmSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

function isolatedPackage(t) {
  const directory = mkdtempSync(join(tmpdir(), 'manger-package-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of readdirSync(__dirname).filter(file => file.endsWith('.js') && !file.endsWith('.test.js'))) {
    cpSync(join(__dirname, file), join(directory, file));
  }
  for (const file of ['db', 'public', 'package.json', 'node_modules']) cpSync(join(__dirname, file), join(directory, file), { recursive: true });
  return directory;
}

test('Docker copies the complete runtime instead of maintaining a module list', () => {
  const dockerfile = readFileSync(join(__dirname, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /^COPY\s+(?:--\S+\s+)*\.\s+\.\/?\s*$/m);
  assert.match(dockerfile, /^RUN node image-check\.js$/m);
});

test('the packaged module check succeeds without creating persistent databases', t => {
  const directory = isolatedPackage(t);
  const result = spawnSync(process.execPath, ['image-check.js'], { cwd: directory, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(directory, 'data')), false);
});

test('the packaged module check discovers new root modules without an explicit list', t => {
  const directory = isolatedPackage(t);
  writeFileSync(join(directory, 'future-module.js'), 'throw new Error("new-module-is-checked");');
  const result = spawnSync(process.execPath, ['image-check.js'], { cwd: directory, encoding: 'utf8', timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /new-module-is-checked/);
});

for (const missing of ['catalog-extra.js', 'public/information.html', 'public/food-names.js']) {
  test(`the packaged module check rejects a missing ${missing}`, t => {
    const directory = isolatedPackage(t);
    rmSync(join(directory, missing));
    const result = spawnSync(process.execPath, ['image-check.js'], { cwd: directory, encoding: 'utf8', timeout: 15000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr.replaceAll('\\', '/'), new RegExp(missing.replace(/\.js$/, '').replaceAll('.', '\\.')));
  });
}

test('Compose preserves both SQLite databases in the existing named volume', () => {
  const compose = readFileSync(join(__dirname, 'compose.yaml'), 'utf8');
  const https = readFileSync(join(__dirname, 'compose.https.yaml'), 'utf8');
  const dockerfile = readFileSync(join(__dirname, 'Dockerfile'), 'utf8');
  assert.match(compose, /- manger-data:\/data/);
  assert.match(compose, /volumes:\s*\n  manger-data:\s*$/);
  assert.match(dockerfile, /ENV MANGER_DB=\/data\/manger.db/);
  assert.match(dockerfile, /VOLUME \["\/data"\]/);
  assert.match(https, /target: \/etc\/manger-tls\s+read_only: true/);
  assert.doesNotMatch(https, /target: \/data/);
});

test('Docker context denies unknown files instead of re-including every directory', () => {
  const ignore = readFileSync(join(__dirname, '.dockerignore'), 'utf8');
  assert.match(ignore, /^\*\*$/m);
  assert.match(ignore, /^!\*\*\/\*\.js$/m);
  // Docker cleans trailing slashes: !**/ would actually mean !** (allow everything).
  assert.doesNotMatch(ignore, /^!\*\*\/?$/m);
  for (const pattern of ['**/data', '**/tls', '**/node_modules', '**/docs', '**/scripts', '**/.*', '**/*.db*', '**/*.key', '**/*.pem']) {
    assert.ok(ignore.split(/\r?\n/).includes(pattern), pattern);
  }
});

test('Docker exclusions deny descendants explicitly after the JavaScript inclusion rule', () => {
  const patterns = readFileSync(join(__dirname, '.dockerignore'), 'utf8').split(/\r?\n/);
  const directories = patterns.filter(pattern => /^\*\*\/[^/*]+$/.test(pattern));
  assert.ok(directories.includes('**/scripts'));
  for (const pattern of directories) assert.ok(patterns.includes(`${pattern}/**`), `Missing descendant exclusion: ${pattern}/**`);
  assert.ok(patterns.includes('**/.*/**'), 'Hidden directory descendants must stay excluded');
});
