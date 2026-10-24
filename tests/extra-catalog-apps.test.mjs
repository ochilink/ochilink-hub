import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('extra production catalog apps are normalized as official ecosystem products', () => {
  const sql = fs.readFileSync(
    new URL('../database/migrations/011_normalize_extra_catalog_apps.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /WHERE slug = 'home-value'/);
  assert.match(sql, /WHERE slug = 'real-estate-directory'/);
  assert.match(sql, /sort_order = 25/);
  assert.match(sql, /sort_order = 26/);
  assert.match(sql, /011_normalize_extra_catalog_apps/);
});
