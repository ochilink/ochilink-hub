import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('shared system typography is loaded across primary Ochilink surfaces', () => {
  const css = fs.readFileSync(new URL('../public/assets/hub-typography.css', import.meta.url), 'utf8');
  const pages = [
    '../public/index.html',
    '../public/booking/index.html',
    '../public/admin/index.html',
  ].map(path => fs.readFileSync(new URL(path, import.meta.url), 'utf8'));

  assert.match(css, /-apple-system/);
  assert.match(css, /BlinkMacSystemFont/);
  assert.match(css, /"Segoe UI"/);
  assert.match(css, /Roboto/);
  assert.match(css, /Helvetica/);
  assert.match(css, /font-weight: 800/);
  assert.match(css, /font-weight: 600/);
  assert.match(css, /ui-monospace/);

  for (const page of pages) {
    assert.match(page, /hub-typography\.css/);
  }
});
