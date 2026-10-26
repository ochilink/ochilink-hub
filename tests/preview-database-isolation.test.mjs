import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseConnectionString } from '../api/_db.js';

test('Vercel Preview prefers PREVIEW_DATABASE_URL over shared production database variables', () => {
  const value = databaseConnectionString({
    VERCEL_ENV: 'preview',
    PREVIEW_DATABASE_URL: 'postgresql://preview.example/db',
    DATABASE_URL: 'postgresql://production.example/db',
    POSTGRES_URL: 'postgresql://fallback.example/db',
  });
  assert.equal(value, 'postgresql://preview.example/db');
});

test('production and non-Vercel runtimes continue to use DATABASE_URL with POSTGRES_URL fallback', () => {
  assert.equal(databaseConnectionString({
    VERCEL_ENV: 'production',
    PREVIEW_DATABASE_URL: 'postgresql://preview.example/db',
    DATABASE_URL: 'postgresql://production.example/db',
  }), 'postgresql://production.example/db');
  assert.equal(databaseConnectionString({
    POSTGRES_URL: 'postgresql://fallback.example/db',
  }), 'postgresql://fallback.example/db');
});
