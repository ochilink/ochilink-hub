import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('rental application inline module bundle parses without syntax errors', () => {
  const html = fs.readFileSync(new URL('../public/rental-application/index.html', import.meta.url), 'utf8');
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match, 'rental module script missing');
  try {
    new vm.Script(match[1], { filename: 'rental-application-inline.js' });
  } catch (error) {
    const stack = String(error.stack || error);
    const lines = stack.split('\n');
    const marker = lines.findIndex((line) => line.startsWith('rental-application-inline.js:'));
    if (marker >= 0 && lines[marker + 1] && lines[marker + 2]) {
      const sourceLine = lines[marker + 1];
      const caretLine = lines[marker + 2];
      const column = caretLine.indexOf('^');
      console.error('RENTAL_PARSE_COLUMN=' + column);
      console.error('RENTAL_PARSE_CONTEXT=' + sourceLine.slice(Math.max(0, column - 220), column + 220));
    } else {
      console.error(stack);
    }
    throw error;
  }
});
