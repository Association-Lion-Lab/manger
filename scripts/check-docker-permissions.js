const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { spawnSync } = require('node:child_process');

// Build the real Dockerfile with synthetic files only; never copy a private checkout.
const directory = mkdtempSync(join(tmpdir(), 'manger-permissions-'));
const tag = `manger:permissions-check-${process.pid}-${Date.now()}`;
let built = false;
try {
  const manifest = { name: 'manger-permissions-fixture', version: '1.0.0', private: true };
  const files = {
    'package.json': JSON.stringify(manifest),
    'package-lock.json': JSON.stringify({ ...manifest, lockfileVersion: 3, packages: { '': manifest } }),
    'server.js': 'module.exports = {};',
    'future-module.js': 'module.exports = 42;',
    'db/future-module.js': 'module.exports = 43;',
    'public/index.html': '<p>Synthetic permissions fixture</p>',
    'LICENSE': 'Synthetic permissions fixture',
    'executable.js': '#!/usr/bin/env node\nconsole.log("executable");',
  };
  files['image-check.js'] = `const fs = require('node:fs'), assert = require('node:assert/strict');
    assert.notEqual(process.getuid(), 0);
    for (const file of ${JSON.stringify(Object.keys(files))}) {
      fs.readFileSync(file);
      assert.equal(fs.statSync(file).uid, 0, file);
      assert.throws(() => fs.accessSync(file, fs.constants.W_OK), {code:'EACCES'}, file);
    }
    assert.equal(require('./future-module'), 42);
    assert.equal(require('./db/future-module'), 43);
    assert.equal(fs.statSync('db').mode & 0o777, 0o755);
    assert.equal(fs.statSync('public').mode & 0o777, 0o755);
    assert.equal(fs.statSync('server.js').mode & 0o777, 0o644);
    assert.equal(fs.statSync('executable.js').mode & 0o777, 0o755);
    console.log('Source files readable, root-owned and non-writable by the app; executables preserved.');`;
  for (const [file, content] of Object.entries(files)) {
    const target = join(directory, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const original = readFileSync(join(__dirname, '..', 'Dockerfile'), 'utf8').replaceAll('\r\n', '\n');
  const restricted = original.replace('COPY . .\n', `COPY . .
RUN find /app -type d -exec chmod 700 {} + && find /app -type f -exec chmod 600 {} + && chmod 700 /app/executable.js
`);
  assert.notEqual(restricted, original, 'The permissions fixture must restrict the copied files before normalization.');
  const result = spawnSync('docker', ['build', '--progress=plain', '-t', tag, '-f', '-', directory], {
    input: restricted, encoding: 'utf8', timeout: 180000,
  });
  if (result.error || result.signal || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Permissions build failed');
  built = true;
  console.log('Docker permissions: restrictive files/directories read by node, code stays root-owned and non-writable.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (built) {
    const result = spawnSync('docker', ['image', 'rm', tag], { encoding: 'utf8', timeout: 30000 });
    if (result.error || result.signal || result.status !== 0) {
      console.error(result.error?.message || result.stderr || 'Could not remove the synthetic permissions image');
      process.exitCode = 1;
    }
  }
  assert.equal(dirname(directory), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith('manger-permissions-'));
  rmSync(directory, { recursive: true, force: true });
}
