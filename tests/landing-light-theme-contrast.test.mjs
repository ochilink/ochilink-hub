import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('landing light theme exposes semantic theme state and readable text tokens', () => {
  const page = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../public/assets/hub-readability.css', import.meta.url), 'utf8');

  assert.match(page, /"data-theme":e/);
  assert.match(css, /body\[data-hub-page='landing'\] \[data-theme='light'\]/);
  assert.match(css, /--text: #0F172A/);
  assert.match(css, /--text-secondary: #334155/);
  assert.match(css, /\.app-card-title[\s\S]*color: var\(--text\) !important/);
  assert.match(css, /\.app-card-description[\s\S]*color: var\(--text-secondary\) !important/);
  assert.match(css, /:is\(\.text-white, \[class\*='text-white\/'\]\)/);
  assert.match(css, /\.accent-text[\s\S]*color: transparent !important/);
});
