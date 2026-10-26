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
    console.error(String(error.stack || error));
    throw error;
  }
});
