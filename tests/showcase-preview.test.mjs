import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createShowcasePreviewHandler } from '../api/showcase-preview.js';

const previewEnv = {
  VERCEL_ENV: 'preview',
  BLOB_STORE_ID: 'preview-test-store',
  BLOB_READ_WRITE_TOKEN: 'mock-preview-token',
};
const appId = '11111111-1111-4111-8111-111111111111';
const objectKey = 'showcases/33333333-3333-4333-8333-333333333333.html';
const token = 'a'.repeat(64);
const html = Buffer.from('<!doctype html><html><script>alert(1)</script></html>');
function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(s) { this.statusCode = s; return this; },
    json(v) { this.body = v; return this; },
    send(v) { this.body = v; return this; },
  };
}
function setup({ user = true, media = { kind: 'html', object_key: objectKey },
  bytes = html, retrieve = true, env = previewEnv } = {}) {
  let queries = 0;
  let fetches = 0;
  let lastOptions;
  const pool = { async query() {
    queries++;
    return { rows: queries === 1 ? (user ? [{ id: 'admin' }] : []) : (media ? [media] : []) };
  }};
  const handler = createShowcasePreviewHandler({
    poolProvider: () => pool,
    env,
    retrieve: async (_key, options) => {
      lastOptions = options;
      fetches++;
      return retrieve ? { stream: Readable.from([bytes]) } : null;
    },
  });
  const req = { method: 'GET', query: { app_id: appId },
    headers: { cookie: 'ochi_session=' + token } };
  return { handler, req, counters: () => ({ queries, fetches }), options: () => lastOptions };
}
async function run(s, overrides = {}) {
  const res = response();
  await s.handler({ ...s.req, ...overrides }, res);
  return res;
}
const originalEnv = process.env.VERCEL_ENV;
test.after(() => {
  if (originalEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalEnv;
});
test('preview endpoint is unavailable in production before database access', async () => {
  process.env.VERCEL_ENV = 'production';
  const s = setup({ env: { ...previewEnv, VERCEL_ENV: 'production' } });
  const r = await run(s);
  assert.equal(r.statusCode, 404);
  assert.deepEqual(s.counters(), { queries: 0, fetches: 0 });
});
test('preview requires authentication and rejects non-admins', async () => {
  process.env.VERCEL_ENV = 'preview';
  const s = setup();
  assert.equal((await run(s, { headers: {} })).statusCode, 401);
  assert.deepEqual(s.counters(), { queries: 0, fetches: 0 });
  const nonAdmin = setup({ user: false });
  assert.equal((await run(nonAdmin)).statusCode, 403);
  assert.equal(nonAdmin.counters().fetches, 0);
});
test('preview rejects invalid app IDs and uncommitted or missing previews', async () => {
  process.env.VERCEL_ENV = 'preview';
  const invalid = setup();
  assert.equal((await run(invalid, { query: { app_id: 'bad' } })).statusCode, 400);
  assert.equal(invalid.counters().fetches, 0);
  const missing = setup({ media: null });
  assert.equal((await run(missing)).statusCode, 404);
  assert.equal(missing.counters().fetches, 0);
  const badKey = setup({ media: { kind: 'html', object_key: '../private.html' } });
  assert.equal((await run(badKey)).statusCode, 404);
  assert.equal(badKey.counters().fetches, 0);
});
test('HTML is delivered as non-executable text with restrictive headers', async () => {
  process.env.VERCEL_ENV = 'preview';
  const s = setup();
  const r = await run(s);
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.match(r.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(r.headers['cache-control'], 'private, no-store');
  assert.deepEqual(r.body, html);
  assert.equal(s.counters().fetches, 1);
});
test('private storage missing objects and oversized objects fail closed', async () => {
  process.env.VERCEL_ENV = 'preview';
  assert.equal((await run(setup({ retrieve: false }))).statusCode, 404);
  const oversized = setup({ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) });
  assert.equal((await run(oversized)).statusCode, 413);
});
test('image content type is restricted to validated object extension', async () => {
  process.env.VERCEL_ENV = 'preview';
  const key = objectKey.replace('.html', '.png');
  const s = setup({ media: { kind: 'image', object_key: key }, bytes: Buffer.from([137, 80, 78, 71]) });
  const r = await run(s);
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'image/png');
  const mismatch = setup({ media: { kind: 'html', object_key: key } });
  assert.equal((await run(mismatch)).statusCode, 404);
});

test('retrieval uses only the explicitly configured Preview Blob credentials', async () => {
  const s = setup({ env: { ...previewEnv, PROD_BLOB_READ_WRITE_TOKEN: 'production-token', PROD_BLOB_STORE_ID: 'production-store' } });
  const r = await run(s);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(s.options(), {
    access: 'private',
    token: 'mock-preview-token',
    storeId: 'preview-test-store',
  });
});
test('missing Preview credentials prevent retrieval before Blob access', async () => {
  const s = setup({ env: { VERCEL_ENV: 'preview', PROD_BLOB_READ_WRITE_TOKEN: 'production-token', PROD_BLOB_STORE_ID: 'production-store' } });
  const r = await run(s);
  assert.equal(r.statusCode, 500);
  assert.equal(s.counters().fetches, 0);
});
