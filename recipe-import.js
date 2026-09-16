const { lookup } = require('node:dns/promises');
const { get } = require('node:https');
const { isIP } = require('node:net');

function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

function importUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Lien HTTPS invalide');
  let url;
  try { url = new URL(value); } catch { throw new Error('Lien HTTPS invalide'); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.hostname.includes(':')) throw new Error('Utilise un lien HTTPS public sur le port standard (IPv4)');
  url.hash = '';
  return url;
}

async function resolvePublic(hostname, resolve = lookup) {
  const addresses = await resolve(hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some(item => !publicIPv4(item.address))) throw new Error('Les adresses privées, locales et réservées sont interdites');
  return addresses[0].address;
}

async function downloadRecipePage(value) {
  let url = importUrl(value);
  const deadline = Date.now() + 15000;
  for (let redirects = 0; redirects <= 3; redirects++) {
    let dnsTimer;
    const address = await Promise.race([
      resolvePublic(url.hostname),
      new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new Error('Le site met trop de temps à répondre')), Math.max(1, deadline - Date.now())); })
    ]).finally(() => clearTimeout(dnsTimer));
    const result = await new Promise((resolve, reject) => {
      let timer;
      // Pin the validated address: no second DNS resolution or pooled connection.
      const request = get(url, {
        agent: false,
        lookup: (_hostname, options, callback) => options.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4),
        headers: { 'User-Agent': 'Manger-recipe-import/0.1', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' }
      }, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          clearTimeout(timer); response.destroy();
          if (!response.headers.location) return reject(new Error('Redirection sans destination'));
          return resolve({ location: response.headers.location });
        }
        if (response.statusCode !== 200) { response.destroy(); clearTimeout(timer); return reject(new Error(`Le site refuse ou ne trouve pas cette page (HTTP ${response.statusCode})`)); }
        if (!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(response.headers['content-type'] || '') || !['identity', undefined].includes(response.headers['content-encoding'])) { response.destroy(); clearTimeout(timer); return reject(new Error('Le site ne renvoie pas une page HTML compatible')); }
        const chunks = []; let size = 0;
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 1500000) request.destroy(new Error('Page trop volumineuse (1,5 Mo maximum)'));
          else chunks.push(chunk);
        });
        response.on('error', error => { clearTimeout(timer); reject(error); });
        response.on('end', () => { clearTimeout(timer); resolve({ html: Buffer.concat(chunks).toString('utf8') }); });
      });
      timer = setTimeout(() => request.destroy(new Error('Le site met trop de temps à répondre')), Math.max(1, deadline - Date.now()));
      request.on('error', error => { clearTimeout(timer); reject(error); });
    });
    if (result.html != null) return { html: result.html, sourceUrl: url.href };
    // Validate and resolve every redirect again, including same-host redirects.
    url = importUrl(new URL(result.location, url).href);
  }
  throw new Error('Trop de redirections sur ce site');
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', eacute: 'é', egrave: 'è', agrave: 'à', rsquo: '’', frac12: '½', frac14: '¼', frac34: '¾' };
  return value.replace(/<[^<>]*>/g, ' ').replace(/&(#x[\da-f]+|#\d+|[a-z\d]+);/gi, (whole, entity) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? whole;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  }).replace(/\s+/g, ' ').trim();
}

function durationMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  const minutes = Number(match[1] || 0) * 1440 + Number(match[2] || 0) * 60 + Number(match[3] || 0) + Number(match[4] || 0) / 60;
  return minutes > 0 && minutes <= 1440 ? Math.ceil(minutes) : null;
}

function ingredientDraft(line) {
  const text = cleanText(line);
  const normalized = text.replace(/(\d)\s*([½¼¾])/g, '$1 $2').replace(/½/g, '1/2').replace(/¼/g, '1/4').replace(/¾/g, '3/4');
  const match = normalized.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return { name: text, amount: 1, unit: 'à ajuster' };
  const parts = match[1].split(/\s+/);
  const number = value => value.includes('/') ? Number(value.split('/')[0]) / Number(value.split('/')[1]) : Number(value.replace(',', '.'));
  const amount = parts.reduce((sum, part) => sum + number(part), 0);
  const units = match[2].match(/^(kg|kilogrammes?|g|gr|grammes?|ml|cl|dl|l|litres?|c\.\s*à\s*soupe|c\.\s*à\s*café|cuillères? à soupe|cuillères? à café|cups?|tbsp|tsp)(?=\s|$)\s*(.*)$/i);
  const aliases = { gr: 'g', gramme: 'g', grammes: 'g', kilogramme: 'kg', kilogrammes: 'kg', litre: 'l', litres: 'l' };
  const unit = units ? aliases[units[1].toLowerCase()] || units[1].toLowerCase() : 'pièce';
  const name = (units ? units[2] : match[2]).replace(/^(?:de\s+|d[’']\s*)/i, '').trim();
  return name && Number.isFinite(amount) && amount > 0 ? { name, amount, unit } : { name: text, amount: 1, unit: 'à ajuster' };
}

function extractRecipeDraft(html, sourceUrl) {
  const nodes = [];
  function visit(value, depth = 0) {
    if (depth > 30 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(item => visit(item, depth + 1));
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some(type => typeof type === 'string' && /(?:^|[\/#])Recipe$/.test(type))) nodes.push(value);
    Object.values(value).forEach(item => visit(item, depth + 1));
  }
  const lower = html.toLowerCase(); let cursor = 0;
  while (cursor < html.length) {
    const start = lower.indexOf('<script', cursor); if (start < 0) break;
    if (!/[\s>]/.test(lower[start + 7] || '')) { cursor = start + 7; continue; }
    const headEnd = lower.indexOf('>', start + 7); if (headEnd < 0) break;
    const close = lower.indexOf('</script', headEnd + 1); if (close < 0) break;
    const closeEnd = lower.indexOf('>', close + 8); if (closeEnd < 0) break;
    cursor = closeEnd + 1;
    if (!/(?:^|\s)type\s*=\s*(["'])application\/ld\+json\1/i.test(html.slice(start + 7, headEnd))) continue;
    try { visit(JSON.parse(html.slice(headEnd + 1, close))); } catch { /* Ignore unrelated malformed JSON-LD. */ }
  }
  if (!nodes.length) throw new Error('Aucune recette structurée trouvée. Ce site n’est pas compatible avec cet import ; crée la recette manuellement.');
  const warnings = ['Vérifie les quantités, unités, portions, durée totale et régime avant d’enregistrer. Les étapes importées sont classées en préparation, sans minuteur automatique.'];
  const drafts = nodes.slice(0, 10).map(node => {
    const rawIngredients = Array.isArray(node.recipeIngredient) ? node.recipeIngredient : [];
    const instructions = [];
    function steps(value, depth = 0) {
      if (depth > 20) return;
      if (typeof value === 'string') { const text = cleanText(value); if (text) instructions.push(text); }
      else if (Array.isArray(value)) value.forEach(item => steps(item, depth + 1));
      else if (value && typeof value === 'object') {
        if (value.itemListElement) steps(value.itemListElement, depth + 1);
        else if (value.text || value.name) steps(value.text || value.name, depth + 1);
      }
    }
    steps(node.recipeInstructions);
    if (!rawIngredients.length || !instructions.length) return null;
    const yieldText = cleanText(String(Array.isArray(node.recipeYield) ? node.recipeYield[0] : node.recipeYield || ''));
    const yieldMatch = yieldText.match(/^\s*(\d+)\s*(?:personnes?|portions?|servings?)?\s*$/i);
    const servings = yieldMatch && Number(yieldMatch[1]) >= 1 && Number(yieldMatch[1]) <= 100 ? Number(yieldMatch[1]) : 2;
    const recognizedTime = durationMinutes(node.totalTime) || ((durationMinutes(node.prepTime) || 0) + (durationMinutes(node.cookTime) || 0));
    const minutes = recognizedTime || 30;
    if (!yieldMatch) warnings.push('Nombre de portions non reconnu : 2 proposé, à corriger.');
    if (!recognizedTime) warnings.push('Durée absente ou non reconnue : 30 min proposé, à corriger.');
    const ingredients = rawIngredients.filter(item => typeof item === 'string').map(ingredientDraft);
    if (ingredients.some(item => item.unit === 'à ajuster')) warnings.push('Certains ingrédients n’ont pas de quantité reconnue : les lignes « à ajuster » sont à corriger.');
    return { title: cleanText(node.name), minutes, servings, diet: 'omnivore', tags: [], sourceUrl, ingredients, steps: instructions.map(instruction => ({ kind: 'prep', instruction, minutes: null })) };
  }).filter(Boolean);
  if (!drafts.length) throw new Error('La recette trouvée ne contient pas d’ingrédients et d’étapes exploitables');
  return { recipes: drafts, warnings: [...new Set(warnings)] };
}

module.exports = { publicIPv4, importUrl, resolvePublic, downloadRecipePage, cleanText, durationMinutes, ingredientDraft, extractRecipeDraft };
