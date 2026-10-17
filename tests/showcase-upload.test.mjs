import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createShowcaseUploadHandler } from '../api/showcase-upload.js';

const appId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const html = Buffer.from('<!doctype html><html><body>Demo</body></html>');
const token = 'a'.repeat(64);
function request(overrides = {}) {
  const { bytes = html, headers = {}, ...rest } = overrides;
  const req = Readable.from([bytes]);
  Object.assign(req, {
    method: 'POST',
    query: { app_id: appId },
    headers: {
      host: 'ochilink.example',
      origin: 'https://ochilink.example',
      cookie: 'ochi_session=' + token,
      'content-type': 'text/html',
      'x-media-filename': 'demo.html',
      'content-length': String(bytes.length),
      ...headers,
    },
    ...rest,
  });
  return req;
}
function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k,v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(v) { this.body = v; return this; },
  };
}
function database({ admin = true, app = true, failAudit = false } = {}) {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (failAudit && sql.includes('INSERT INTO security_auth_logs'))
        throw new Error('audit unavailable');
      return { rows: [] };
    },
    release() {},
  };
  return {
    queries,
    pool: {
      async query(sql) {
        queries.push({ sql });
        if (sql.includes('FROM hub_sessions')) return { rows: admin ? [{ id: adminId }] : [] };
        if (sql.includes('SELECT id FROM apps')) return { rows: app ? [{ id: appId }] : [] };
        if (sql.includes('INSERT INTO showcase_upload_intents')) return { rows: [{ intent_id: appId }] };
        if (sql.includes('UPDATE showcase_upload_intents')) return { rowCount: 1 };
        throw new Error('Unexpected query');
      },
      async connect() { return client; },
    },
  };
}
function setup(db, store) {
  return createShowcaseUploadHandler({
    poolProvider: () => db.pool,
    store,
  });
}
test('media upload denies missing session and non-admin users before storage', async () => {
  let uploads = 0;
  const store = async () => { uploads++; };
  const db = database({ admin: false });
  const handler = setup(db, store);
  const noSession = response();
  await handler(request({ headers: { cookie: '' } }), noSession);
  assert.equal(noSession.statusCode, 401);
  const nonAdmin = response();
  await handler(request(), nonAdmin);
  assert.equal(nonAdmin.statusCode, 403);
  assert.equal(uploads, 0);
});

test('media upload rejects foreign origin, invalid files and oversized request', async () => {
  let uploads = 0;
  const db = database();
  const handler = setup(db, async () => { uploads++; });
  for (const [req, status] of [
    [request({ headers: { origin: 'https://attacker.example' } }), 403],
    [request({ bytes: Buffer.from('bad'), headers: { 'content-type': 'image/png', 'x-media-filename': 'bad.png' } }), 400],
    [request({ headers: { 'content-length': String(6 * 1024 * 1024) } }), 413],
    [request({ query: { app_id: 'invalid' } }), 400],
  ]) {
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, status);
  }
  assert.equal(uploads, 0);
});

test('media upload updates app metadata and audits after successful storage', async () => {
  const db = database();
  const key = 'showcases/valid.html';
  const handler = setup(db, async ({ bytes, contentType, filename }) => {
    assert.equal(bytes.toString(), html.toString());
    assert.equal(contentType, 'text/html');
    assert.equal(filename, 'demo.html');
    return { objectKey: key, kind: 'html', byteLength: bytes.length, sha256: 'b'.repeat(64) };
  });
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { ok: true, kind: 'html' });
  assert.ok(db.queries.some(q => q.sql.includes('UPDATE apps') && q.params[1] === key));
  const audit = db.queries.find(q => q.sql.includes('INSERT INTO security_auth_logs'));
  assert.equal(audit.params[0], adminId);
  assert.equal(JSON.parse(audit.params[1]).object_key, key);
  assert.ok(db.queries.some(q => q.sql === 'COMMIT'));
});

test('media upload rejects missing app and storage failure without updating metadata', async () => {
  const missing = database({ app: false });
  let uploads = 0;
  const handlerMissing = setup(missing, async () => { uploads++; });
  const r1 = response();
  await handlerMissing(request(), r1);
  assert.equal(r1.statusCode, 404);
  assert.equal(uploads, 0);
  const db = database();
  const handler = setup(db, async () => { throw new Error('storage down'); });
  const r2 = response();
  await handler(request(), r2);
  assert.equal(r2.statusCode, 500);
  assert.equal(r2.body.error, 'Media upload unavailable.');
  assert.equal(db.queries.some(q => q.sql.includes('UPDATE apps')), false);
});

test('media upload rolls back database transaction when audit insertion fails', async () => {
  const db = database({ failAudit: true });
  const key = 'showcases/11111111-1111-4111-8111-111111111111.html';
  const removed = [];
  const handler = createShowcaseUploadHandler({
    poolProvider: () => db.pool,
    store: async () => ({
      objectKey: key, kind: 'html', byteLength: html.length, sha256: 'b'.repeat(64),
    }),
    remove: async (objectKey) => { removed.push(objectKey); },
  });
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 500);
  assert.ok(db.queries.some(q => q.sql === 'ROLLBACK'));
  assert.equal(db.queries.some(q => q.sql === 'COMMIT'), false);
  assert.deepEqual(removed, [key]);
});

test('cleanup failure does not report upload success or commit failed metadata', async () => {
  const db = database({ failAudit: true });
  const key = 'showcases/33333333-3333-4333-8333-333333333333.html';
  const handler = createShowcaseUploadHandler({
    poolProvider: () => db.pool,
    store: async () => ({
      objectKey: key, kind: 'html', byteLength: html.length, sha256: 'c'.repeat(64),
    }),
    remove: async () => { throw new Error('simulated cleanup outage'); },
  });
  const original = console.error;
  const logged = [];
  console.error = (...args) => { logged.push(args); };
  try {
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'Media upload unavailable.');
    assert.ok(db.queries.some(q => q.sql === 'ROLLBACK'));
    assert.equal(db.queries.some(q => q.sql === 'COMMIT'), false);
    assert.ok(logged.some(args => args[1]?.code === 'SHOWCASE_ORPHAN_CLEANUP_FAILED' && args[1]?.objectKey === key));
  } finally {
    console.error = original;
  }
});
