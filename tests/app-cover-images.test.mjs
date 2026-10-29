import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('public app cards render cover images with a branded fallback', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const hook = fs.readFileSync(new URL('../public/assets/hub-public.js', import.meta.url), 'utf8');

  assert.match(hook, /cover: app\.cover_image_url \|\| ''/);
  assert.match(html, /h\.cover\?m\("button"/);
  assert.match(html, /loading:"lazy"/);
  assert.match(html, /object-contain bg-black transition-\[filter\] duration-300 group-hover:brightness-110/);
  assert.doesNotMatch(html, /group-hover:scale-\[/);
  assert.match(html, /radial-gradient\(circle at 20% 20%/);
});

test('admin app editor supports HTTPS URLs and direct screenshot uploads', () => {
  const html = fs.readFileSync(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  const admin = fs.readFileSync(new URL('../public/assets/hub-admin.js', import.meta.url), 'utf8');

  assert.match(html, /Cover image URL https:\/\//);
  assert.match(html, /Upload screenshot/);
  assert.match(html, /Remove cover/);
  assert.match(html, /hub-cover-uploader\.js/);
  assert.match(html, /cover_image_url/);
  assert.match(html, /App cover preview/);
  assert.match(admin, /cover_image_url: app\.cover_image_url \|\| ''/);
  assert.match(admin, /cover_image_url: app\.cover_image_url \|\| null/);
});

test('cover image migrations support HTTPS and safe inline raster data', () => {
  const initial = fs.readFileSync(
    new URL('../database/migrations/009_app_cover_images.sql', import.meta.url),
    'utf8',
  );
  const inline = fs.readFileSync(
    new URL('../database/migrations/012_inline_app_cover_images.sql', import.meta.url),
    'utf8',
  );

  assert.match(initial, /ADD COLUMN IF NOT EXISTS cover_image_url TEXT/);
  assert.match(inline, /apps_cover_image_source_safe/);
  assert.match(inline, /\^https:\/\//);
  assert.match(inline, /data:image\/\(jpeg\|png\|webp\);base64/);
  assert.match(inline, /length\(cover_image_url\) <= 150000/);
});

test('cover uploader creates a fast thumbnail and a high-resolution 16:9 preview', () => {
  const uploader = fs.readFileSync(
    new URL('../public/assets/hub-cover-uploader.js', import.meta.url),
    'utf8',
  );

  assert.match(uploader, /640, 360, 0\.68/);
  assert.match(uploader, /1600, 900, 0\.84/);
  assert.match(uploader, /1280, 720, 0\.82/);
  assert.match(uploader, /image\/jpeg/);
  assert.match(uploader, /image\/png/);
  assert.match(uploader, /image\/webp/);
  assert.match(uploader, /canvas\.toDataURL\('image\/jpeg'/);
  assert.match(uploader, /MAX_THUMBNAIL_DATA_URL_LENGTH = 150000/);
  assert.match(uploader, /MAX_PREVIEW_DATA_URL_LENGTH = 700000/);
  assert.match(uploader, /return \{ thumbnail, preview \}/);
});


test('app cover images open an accessible lightbox without triggering card navigation', () => {
  const html = fs.readFileSync(
    new URL('../public/index.html', import.meta.url),
    'utf8',
  );

  assert.match(html, /cursor-zoom-in/);
  assert.match(html, /View larger preview of \$\{h\.name\}/);
  assert.match(html, /preventDefault\(\),T\.stopPropagation\(\)/);
  assert.match(html, /role:"dialog"/);
  assert.match(html, /"aria-modal":"true"/);
  assert.match(html, /Close image preview/);
  assert.match(html, /f\.key==="Escape"/);
  assert.match(html, /h\.target===h\.currentTarget&&O\(null\)/);
  assert.match(html, /document\.body\.style\.overflow="hidden"/);
  assert.match(html, /max-h-\[82vh\]/);
  assert.match(html, /resource=cover-preview&slug=/);
  assert.match(html, /encodeURIComponent\(h\.slug\)/);
});


test('high-resolution preview migration stores previews separately from thumbnails', () => {
  const sql = fs.readFileSync(
    new URL('../database/migrations/013_high_res_app_cover_previews.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /ADD COLUMN IF NOT EXISTS cover_preview_image TEXT/);
  assert.match(sql, /length\(cover_preview_image\) <= 700000/);
  assert.match(sql, /apps_cover_preview_image_safe/);
});
