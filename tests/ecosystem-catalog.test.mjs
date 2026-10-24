import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ecosystem catalog UI exposes total count and expanded architecture matrix', () => {
  const html = fs.readFileSync(
    new URL('../public/index.html', import.meta.url),
    'utf8',
  );

  assert.match(html, /\$\{hub\.apps\.length\} products/);
  for (const technology of [
    'React',
    'Next.js',
    'TypeScript',
    'JavaScript',
    'Tailwind',
    'SCSS',
    'CSS',
    'Bootstrap',
    'HTML',
    'Node.js',
    'Laravel',
    'PHP',
    'Python',
    'FastAPI',
    'Electron',
    'PostgreSQL',
    'MySQL',
    'Supabase',
    'Neon',
    'Docker',
    'Render',
    'Vercel',
    'GitHub',
  ]) {
    assert.ok(html.includes(technology), `missing architecture badge: ${technology}`);
  }
});

test('live local products do not render a fake open-app link', () => {
  const hook = fs.readFileSync(
    new URL('../public/assets/hub-public.js', import.meta.url),
    'utf8',
  );
  const html = fs.readFileSync(
    new URL('../public/index.html', import.meta.url),
    'utf8',
  );

  assert.match(hook, /link: app\.link \|\| null/);
  assert.match(html, /Live locally/);
  assert.match(html, /P=T&&!!h\.link/);
});

test('ecosystem migration declares 25 canonical products and retires legacy duplicates', () => {
  const sql = fs.readFileSync(
    new URL('../database/migrations/010_full_ecosystem_catalog.sql', import.meta.url),
    'utf8',
  );

  const canonicalSlugs = [
    'ochilink-database-cloud',
    'ochilink-calendar',
    'ochilink-rental-application',
    'anansy-crm',
    'bull-mountain-trading-journal',
    'ochi-classifieds-rental',
    'rowpro-dealer-hub',
    'ochilink-vault',
    'ochilink-news',
    'ochilink-dev-tools',
    'ochilink-websites-app-management',
    'repost-jamaica',
    'pbris-com',
    'taxdrill-com',
    'hummingbird-trading-app',
    'ochilink-hub',
    'ramonemiami-com',
    'ramonewalker-com',
    'ochilink-document-storage',
    'ochitours',
    'community-association-management',
    'ochishop',
    'ochilink-lower-body-analytics',
    'ochilink-admin',
    'row-pro-repost-studio',
  ];

  for (const slug of canonicalSlugs) {
    assert.ok(sql.includes(`('${slug}'`), `missing catalog product: ${slug}`);
  }
  assert.equal(new Set(canonicalSlugs).size, 25);
  assert.match(sql, /Retire superseded legacy catalog rows/);
  assert.match(sql, /010_full_ecosystem_catalog/);
});
