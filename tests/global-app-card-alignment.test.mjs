import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('global app card layout keeps footer alignment consistent', () => {
  const page = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../public/assets/hub-app-cards.css', import.meta.url), 'utf8');

  assert.match(page, /app-card-grid/);
  assert.match(page, /app-card-meta/);
  assert.match(page, /app-card-title/);
  assert.match(page, /app-card-description/);
  assert.match(page, /app-card-tags/);
  assert.match(page, /app-card-footer/);
  assert.match(page, /hub-app-cards\.css/);

  assert.match(css, /align-items: stretch/);
  assert.match(css, /\.app-card-title[\s\S]*min-height: 40px/);
  assert.match(css, /\.app-card-tags[\s\S]*min-height: 58px/);
  assert.match(css, /\.app-card-footer[\s\S]*margin-top: auto/);
  assert.match(css, /@media \(max-width: 767px\)/);
});
