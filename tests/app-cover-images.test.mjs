import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('public app cards render cover images with a branded fallback', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const hook = fs.readFileSync(new URL('../public/assets/hub-public.js', import.meta.url), 'utf8');

  assert.match(hook, /cover: app\.cover_image_url \|\| ''/);
  assert.match(html, /h\.cover\?m\("img"/);
  assert.match(html, /loading:"lazy"/);
  assert.match(html, /group-hover:scale-\[1\.04\]/);
  assert.match(html, /radial-gradient\(circle at 20% 20%/);
});

test('admin app editor includes dynamic cover image URL support', () => {
  const html = fs.readFileSync(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  const admin = fs.readFileSync(new URL('../public/assets/hub-admin.js', import.meta.url), 'utf8');

  assert.match(html, /Cover image URL https:\/\//);
  assert.match(html, /cover_image_url/);
  assert.match(html, /App cover preview/);
  assert.match(admin, /cover_image_url: app\.cover_image_url \|\| ''/);
  assert.match(admin, /cover_image_url: app\.cover_image_url \|\| null/);
});

test('cover image migration requires HTTPS values', () => {
  const sql = fs.readFileSync(
    new URL('../database/migrations/009_app_cover_images.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /ADD COLUMN IF NOT EXISTS cover_image_url TEXT/);
  assert.match(sql, /apps_cover_image_url_https/);
  assert.match(sql, /\^https:\/\//);
});
