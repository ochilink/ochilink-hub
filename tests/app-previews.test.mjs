import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('hosted app previews preserve production links and are admin managed', () => {
  const migration = fs.readFileSync(new URL('../database/migrations/016_app_preview_library.sql', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../api/hub.js', import.meta.url), 'utf8');
  const service = fs.readFileSync(new URL('../lib/app-previews.js', import.meta.url), 'utf8');
  const storage = fs.readFileSync(new URL('../lib/preview-storage.js', import.meta.url), 'utf8');

  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS app_previews'));
  assert.ok(migration.includes('preview_enabled BOOLEAN'));
  assert.ok(migration.includes('UNIQUE(app_id, version)'));
  assert.ok(migration.includes('app_previews_one_active'));
  assert.ok(api.includes("resource === 'app-preview'"));
  const adminGate = api.indexOf("if (user.role !== 'admin')");
  const previewApi = api.indexOf("resource === 'app-preview'");
  assert.ok(previewApi > adminGate);
  assert.ok(service.includes('APP_PREVIEW_PUBLISHED'));
  assert.ok(service.includes('APP_PREVIEW_VERSION_ACTIVATED'));
  assert.ok(service.includes('APP_PREVIEW_VISIBILITY_CHANGED'));
  assert.ok(storage.includes('PREVIEW_BLOB_READ_WRITE_TOKEN'));
  assert.ok(storage.includes('.public.blob.vercel-storage.com'));
  assert.ok(storage.includes("allowedContentTypes: ['text/html']"));
  assert.ok(storage.includes('8 * 1024 * 1024') === false);
});

test('public catalog uses preview URL only for enabled pending previews', () => {
  const api = fs.readFileSync(new URL('../api/hub.js', import.meta.url), 'utf8');
  const pub = fs.readFileSync(new URL('../public/assets/hub-public.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.ok(api.includes('p.public_url AS preview_url'));
  assert.ok(api.includes('a.preview_enabled'));
  assert.ok(pub.includes('production_link: app.link || null'));
  assert.ok(pub.includes("app.status === 'Live'"));
  assert.ok(pub.includes('app.preview_enabled && app.preview_url'));
  assert.ok(page.includes('let T=h.status==="live",P=!!h.link'));
  assert.ok(page.includes('T?"Open app ":"View preview "'));
});

test('preview admin supports HTML upload, version history and visibility controls', () => {
  const page = fs.readFileSync(new URL('../public/admin/previews/index.html', import.meta.url), 'utf8');
  const route = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
  const nav = fs.readFileSync(new URL('../public/assets/hub-rental-admin-link.js', import.meta.url), 'utf8');

  assert.ok(page.includes('Hosted Preview Library'));
  assert.ok(page.includes("accept=\"text/html,.html,.htm\""));
  assert.ok(page.includes("api('begin-upload'"));
  assert.ok(page.includes("api('complete-upload'"));
  assert.ok(page.includes("api('activate'"));
  assert.ok(page.includes("api('enabled'"));
  assert.ok(page.includes("'x-vercel-blob-access':'public'"));
  assert.ok(route.includes('"source": "/admin/previews"'));
  assert.ok(nav.includes('/admin/previews/'));
});
