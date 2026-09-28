const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');

test('les quatre onglets ont un écran et les scripts intégrés restent valides', () => {
  const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
  const navigation = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0] || '';
  const panels = [...navigation.matchAll(/data-panel="([a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(panels, ['week', 'recipes', 'shopping', 'account']);
  for (const panel of panels) assert.match(html, new RegExp(`<section id="${panel}-panel"`));
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new Script(match[1]);
});
