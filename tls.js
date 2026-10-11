const { readFileSync } = require('node:fs');
const { createSecureContext } = require('node:tls');
const { X509Certificate } = require('node:crypto');

function tlsOptions(env = process.env) {
  const { MANGER_TLS_CERT: cert, MANGER_TLS_KEY: key } = env;
  if (!cert && !key) return null;
  if (!cert || !key) throw new Error('HTTPS : configure MANGER_TLS_CERT et MANGER_TLS_KEY ensemble.');
  const options = { cert: readFileSync(cert), key: readFileSync(key), minVersion: 'TLSv1.2' };
  if (env.MANGER_TLS_CA) options.ca = readFileSync(env.MANGER_TLS_CA);
  // Validate the pair before opening databases; never silently fall back to HTTP.
  createSecureContext(options);
  return options;
}

function localCertificate(options, now = Date.now()) {
  if (!options?.ca) return null;
  try {
    const authority = new X509Certificate(options.ca), server = new X509Certificate(options.cert);
    if (!authority.ca || !authority.checkIssued(authority) || !authority.verify(authority.publicKey) ||
        !server.checkIssued(authority) || !server.verify(authority.publicKey) ||
        [authority, server].some(cert => now < Date.parse(cert.validFrom) || now >= Date.parse(cert.validTo))) return null;
    return authority; // Export the parsed public certificate, never the source PEM bundle or a key.
  } catch { return null; }
}
module.exports = { tlsOptions, localCertificate };
