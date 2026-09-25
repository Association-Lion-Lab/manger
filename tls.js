const { readFileSync } = require('node:fs');
const { createSecureContext } = require('node:tls');

function tlsOptions(env = process.env) {
  const { MANGER_TLS_CERT: cert, MANGER_TLS_KEY: key } = env;
  if (!cert && !key) return null;
  if (!cert || !key) throw new Error('HTTPS : configure MANGER_TLS_CERT et MANGER_TLS_KEY ensemble.');
  const options = { cert: readFileSync(cert), key: readFileSync(key), minVersion: 'TLSv1.2' };
  // Validate the pair before opening databases; never silently fall back to HTTP.
  createSecureContext(options);
  return options;
}
module.exports = { tlsOptions };
