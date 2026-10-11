const nodemailer = require('nodemailer');
const { isIP } = require('node:net');

// One plain address, not a display name, group or recipient list.
function emailAddress(value) {
  if (typeof value !== 'string') throw new Error('Indique une seule adresse de courriel valide.');
  const address = value.trim();
  const parts = address.split('@');
  if (address.length > 254 || parts.length !== 2 || !parts[0] || parts[0].length > 64 ||
      !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) || /(^\.|\.\.|\.$)/.test(parts[0]) ||
      !parts[1].includes('.') || parts[1].split('.').some(label => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) {
    throw new Error('Indique une seule adresse de courriel valide.');
  }
  return address;
}

function createInvitationMailer(env = process.env, transportFactory = nodemailer.createTransport) {
  const host = (env.MANGER_SMTP_HOST || '').trim();
  if (!host) return null; // Opt-in only; never contact a provider at startup.
  if (host.length > 253 || (!isIP(host) && host.split('.').some(label => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label)))) throw new Error('MANGER_SMTP_HOST invalide.');
  const port = Number(env.MANGER_SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MANGER_SMTP_PORT invalide.');
  let from, origin;
  try { from = emailAddress(env.MANGER_SMTP_FROM); } catch { throw new Error('MANGER_SMTP_FROM : adresse de courriel requise.'); }
  try {
    const url = new URL(env.MANGER_APP_URL);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    origin = url.origin;
  } catch { throw new Error('MANGER_APP_URL : origine HTTP ou HTTPS requise, sans chemin ni identifiants.'); }
  const user = env.MANGER_SMTP_USER || '', pass = env.MANGER_SMTP_PASSWORD || '';
  if (Boolean(user) !== Boolean(pass)) throw new Error('MANGER_SMTP_USER et MANGER_SMTP_PASSWORD doivent être renseignés ensemble.');
  const transport = transportFactory({
    host, port, secure: port === 465, requireTLS: port !== 465,
    ...(user ? { auth: { user, pass } } : {}),
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000, dnsTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  return {
    async send(to, token, expires) {
      to = emailAddress(to);
      if (!/^[a-f0-9]{64}$/.test(token) || !Number.isSafeInteger(expires) || expires <= Date.now()) throw new Error('Invitation invalide.');
      const result = await transport.sendMail({
        from: { name: 'Manger!', address: from }, to: { address: to },
        subject: 'Invitation au foyer — Manger!',
        text: 'Rejoins notre foyer sur Manger!\n\nChoisis ton identifiant et ton mot de passe pour accéder aux recettes, au planning et aux courses partagés.\n\n' +
          origin + '/login#invite=' + token + '\n\n' +
          'Lien privé, pour une seule inscription, valable jusqu’au ' + new Date(expires).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) + ' (heure de Paris).\n' +
          'Transmets-le seulement à la personne invitée. Accès au serveur nécessaire par Wi-Fi ou VPN. Si Safari bloque le site, demande d’abord le certificat public et les instructions à l’administrateur.\n' +
          'Si tu n’attendais pas cette invitation, ignore ce message.',
        disableFileAccess: true, disableUrlAccess: true,
      });
      if (!result.accepted?.includes(to) || result.rejected?.length) throw new Error('Courriel non accepté.');
    },
  };
}

module.exports = { createInvitationMailer, emailAddress };
