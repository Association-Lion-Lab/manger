const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

test('le minuteur utilise une échéance et conserve la durée en pause', () => {
  const html = readFileSync(join(__dirname, 'public/index.html'), 'utf8');
  const code = html.match(/function timerSeconds[\s\S]*?(?=    function renderCookingTimers)/)[0];
  const seconds = runInNewContext(`${code}; timerSeconds`);
  assert.equal(seconds({ end: null, remaining: 45 }, 999999), 45);
  assert.equal(seconds({ end: 61000, remaining: 60 }, 1000), 60);
  assert.equal(seconds({ end: 61000, remaining: 60 }, 60500), 1);
  assert.equal(seconds({ end: 61000, remaining: 60 }, 90000), 0);
});
