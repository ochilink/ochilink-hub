import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('extra production catalog apps are normalized as official ecosystem products', () => {
  const sql = fs.readFileSync(
    new URL('../database/migrations/011_normalize_extra_catalog_apps.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /'home-value'/);
  assert.match(sql, /'real-estate-directory'/);
  assert.match(sql, /ON CONFLICT \(slug\) DO UPDATE SET/);
  assert.match(sql, /\b25\b/);
  assert.match(sql, /\b26\b/);
  assert.match(sql, /011_normalize_extra_catalog_apps/);
});
