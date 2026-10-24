import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('database recovery verification remains read-only and tracks current schema ledger', () => {
  const sql = fs.readFileSync(
    new URL('../database/verify_migration_history.sql', import.meta.url),
    'utf8',
  );
  const runbook = fs.readFileSync(
    new URL('../docs/DATABASE_RECOVERY.md', import.meta.url),
    'utf8',
  );

  const expected = [
    '001_ochilink_hub',
    '003_complete_hub',
    '004_direct_booking',
    '009_app_cover_images',
    '010_full_ecosystem_catalog',
    '011_normalize_extra_catalog_apps',
    '012_inline_app_cover_images',
    '013_high_res_app_cover_previews',
    '014_rental_application',
  ];

  for (const version of expected) {
    assert.match(sql, new RegExp(version));
    assert.match(runbook, new RegExp(version));
  }

  assert.doesNotMatch(
    sql,
    /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i,
  );
  assert.match(runbook, /002_import_public_catalog\.sql/);
  assert.match(runbook, /does not insert a row into `hub_schema_migrations`/);
  assert.match(runbook, /008_live_smoke_test\.sql/);
  assert.match(runbook, /requires explicit authorization/i);
});
