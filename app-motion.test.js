const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const css = readFileSync(join(__dirname, 'public/index.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const motion = css.match(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n    \}/)[1];

test('mouvement : toute animation de la page est dans le bloc prefers-reduced-motion: no-preference', () => {
  assert.doesNotMatch(css.replace(motion, ''), /\b(animation|transition)\s*:|@keyframes/);
});

test('mouvement : appui, onglets, coche et fête des courses', () => {
  assert.match(motion, /button:active[^{]*\{[^}]*transform: scale\(\.97\)/);
  assert.match(motion, /button \{ transition:[^}]*transform \.12s/);
  assert.match(motion, /\.panel \{ animation: panel-in \.12s ease-out; \}/);
  assert.match(motion, /\.shopping-item input\[aria-busy="true"\]:checked \+ span \{ opacity: \.4; \}/);
  assert.match(motion, /\.shopping-done-new \.shopping-mascot \{ animation: shopping-hop/);
});

test('lisibilité : chiffres alignés et titres équilibrés', () => {
  assert.match(css, /#shopping-summary, \.day strong \{ font-variant-numeric: tabular-nums; \}/);
  assert.match(css, /h1, h2 \{ text-wrap: balance; \}/);
});
