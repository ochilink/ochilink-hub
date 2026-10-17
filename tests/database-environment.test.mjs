import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectDatabaseConnection } from '../api/_db.js';

test('Preview requires dedicated connection and never falls back to production', () => {
  assert.throws(() => selectDatabaseConnection({
    VERCEL_ENV: 'preview', DATABASE_URL: 'postgres://production',
    POSTGRES_URL: 'postgres://legacy',
  }), /Preview database is not configured/);
  assert.equal(selectDatabaseConnection({
    VERCEL_ENV: 'preview', PREVIEW_DATABASE_URL: 'postgres://development',
    DATABASE_URL: 'postgres://production',
  }), 'postgres://development');
});

test('Production ignores Preview database URL', () => {
  assert.equal(selectDatabaseConnection({
    VERCEL_ENV: 'production', DATABASE_URL: 'postgres://production',
    PREVIEW_DATABASE_URL: 'postgres://development',
  }), 'postgres://production');
  assert.equal(selectDatabaseConnection({
    VERCEL_ENV: 'production', POSTGRES_URL: 'postgres://legacy',
  }), 'postgres://legacy');
});
