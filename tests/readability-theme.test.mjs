import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('readability theme preserves light and dark contrast tokens', () => {
  const css = fs.readFileSync(new URL('../public/assets/hub-readability.css', import.meta.url), 'utf8');
  const pages = [
    '../public/index.html',
    '../public/booking/index.html',
    '../public/admin/index.html',
  ].map(path => fs.readFileSync(new URL(path, import.meta.url), 'utf8'));

  assert.match(css, /--bg: #F8FAFC/);
  assert.match(css, /--text: #0F172A/);
  assert.match(css, /--text-secondary: #334155/);
  assert.match(css, /--border: #CBD5E1/);
  assert.match(css, /--border-strong: #94A3B8/);
  assert.match(css, /--bg: #0B0F1A/);
  assert.match(css, /--bg-elevated: #141B2A/);
  assert.match(css, /--text: #F8FAFC/);
  assert.match(css, /--text-secondary: #E2E8F0/);
  assert.match(css, /--text-muted: #CBD5E1/);
  assert.match(css, /--accent: #00FFC6/);
  assert.match(css, /font-weight: 800/);
  assert.match(css, /font-weight: 700/);
  assert.match(css, /font-weight: 600/);
  assert.match(css, /border-color: var\(--accent\)/);
  assert.match(css, /outline: 2px solid color-mix/);

  for (const page of pages) {
    assert.match(page, /hub-typography\.css/);
    assert.match(page, /hub-readability\.css/);
  }
});
