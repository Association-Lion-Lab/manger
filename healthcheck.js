const { readFileSync } = require('node:fs');

function healthcheck(env = process.env) {
  return new Promise((resolve, reject) => {
    const secure = Boolean(env.MANGER_TLS_CERT || env.MANGER_TLS_KEY);
    if (secure && (!env.MANGER_TLS_CERT || !env.MANGER_TLS_KEY)) return reject(new Error('Configuration HTTPS incomplète.'));
    const options = { hostname: '127.0.0.1', port: Number(env.MANGER_PORT || 3000), path: '/api/health', timeout: 4000, agent: false };
    if (secure && env.MANGER_TLS_CA) options.ca = readFileSync(env.MANGER_TLS_CA);
    const request = require(secure ? 'node:https' : 'node:http').get(options, response => {
      response.resume();
      response.on('end', () => response.statusCode === 200 ? resolve() : reject(new Error(`Healthcheck HTTP ${response.statusCode}`)));
    });
    request.on('timeout', () => request.destroy(new Error('Healthcheck : délai dépassé.')));
    request.on('error', reject);
  });
}
if (require.main === module) healthcheck().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { healthcheck };
