const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync, copyFileSync, constants } = require('node:fs');
const { resolve, join } = require('node:path');
const { isIP } = require('node:net');
const { randomBytes, X509Certificate } = require('node:crypto');

function createLocalTls(address, destination, openssl = 'openssl') {
  if (!isIP(address) || address === '0.0.0.0' || address === '::') throw new Error('Indique une adresse IP précise du serveur, sans port ni URL.');
  execFileSync(openssl, ['version'], { stdio: 'pipe' });
  const directory = resolve(destination);
  // Exclusive directory creation: a renewal must never overwrite an existing CA or server key.
  mkdirSync(directory, { mode: 0o700 });
  const server = join(directory, 'server');
  mkdirSync(server, { mode: 0o750 });
  const run = args => execFileSync(openssl, args, { cwd: directory, stdio: 'pipe' });
  const serial = () => '0x' + randomBytes(16).toString('hex');
  const rootConfig = '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=Manger local CA\n[ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n';
  const serverConfig = `[req]\nprompt=no\ndistinguished_name=dn\n[dn]\nCN=Manger local\n[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1,IP:${address}\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n`;
  writeFileSync(join(directory, 'ca.cnf'), rootConfig, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(directory, 'server.cnf'), serverConfig, { flag: 'wx', mode: 0o600 });
  run(['req','-x509','-newkey','rsa:3072','-nodes','-sha256','-days','3650','-set_serial',serial(),'-config','ca.cnf','-keyout','ca.key','-out','ca.crt']);
  run(['req','-new','-newkey','rsa:2048','-nodes','-sha256','-config','server.cnf','-keyout','server/server.key','-out','server.csr']);
  run(['x509','-req','-in','server.csr','-CA','ca.crt','-CAkey','ca.key','-set_serial',serial(),'-days','365','-sha256','-extfile','server.cnf','-extensions','server','-out','server/server.crt']);
  copyFileSync(join(directory, 'ca.crt'), join(server, 'ca.crt'), constants.COPYFILE_EXCL);
  // OpenSSL's key permissions are reinforced on POSIX; do not change unrelated files.
  const { chmodSync, readFileSync } = require('node:fs');
  for (const file of ['ca.key','server/server.key']) chmodSync(join(directory, file), 0o600);
  const certificate = new X509Certificate(readFileSync(join(directory, 'ca.crt')));
  return { directory, fingerprint: certificate.fingerprint256 };
}
if (require.main === module) {
  try {
    const [address, destination = 'tls'] = process.argv.slice(2);
    const result = createLocalTls(address, destination);
    console.log(`Certificats créés dans ${result.directory}\nEmpreinte SHA-256 de ca.crt : ${result.fingerprint}\nTransfère seulement ca.crt aux appareils de confiance. Ne partage jamais les fichiers .key.\nLe certificat serveur expire dans 365 jours. Consulte HTTPS.md avant activation.`);
  } catch (error) { console.error(`Création HTTPS arrêtée : ${error.message}`); process.exitCode = 1; }
}
module.exports = { createLocalTls };
