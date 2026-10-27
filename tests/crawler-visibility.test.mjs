import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('homepage gives no-JavaScript crawlers fresh ecosystem content', () => {
  const home = file('../public/index.html');
  assert.match(home, /<title>Ochilink — Apps & Services<\/title>/);
  assert.match(home, /<meta name="description" content="Explore Ochilink apps/);
  assert.match(home, /<link rel="canonical" href="https:\/\/ochilink\.com\/">/);
  assert.match(home, /<noscript>[\s\S]*One Link\. Every App\. Built in Ochi, Built for the World\.[\s\S]*<\/noscript>/);
  assert.match(home, /<div id="root"><\/div>/);
  assert.doesNotMatch(home, /Classified Search|Featured Ads — Samsung/);
});

test('robots and sitemap offer only publicly launched pages', () => {
  const robots = file('../public/robots.txt');
  const sitemap = file('../public/sitemap.xml');
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/account/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/ochilink\.com\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/ochilink\.com\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/ochilink\.com\/booking\/<\/loc>/);
  assert.doesNotMatch(sitemap, /\/admin|\/account|\/rental-application|\/api\//);
});
