import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoverShowcaseUploads } from '../lib/showcase-recovery.js';

const candidate = (id = 'a') => ({
  intent_id: id,
  object_key: 'showcases/11111111-1111-4111-8111-111111111111.html',
  state: 'cleanup_required',
});

function database({ intents = [], referenced = false, lock = true, failUpdate = false } = {}) {
  const queries = [];
  let released = 0;
  const client = {
    async query(sql, args) {
      queries.push({ sql, args });
      if (sql.includes('pg_try_advisory_xact_lock'))
        return { rows: [{ acquired: lock }] };
      if (sql.includes('FROM showcase_upload_intents'))
        return { rows: intents };
      if (sql.includes('FROM apps'))
        return { rows: referenced ? [{ exists: 1 }] : [] };
      if (failUpdate && sql.includes('UPDATE showcase_upload_intents'))
        throw new Error('update failed');
      return { rows: [], rowCount: 1 };
    },
    release() { released++; },
  };
  return {
    pool: { connect: async () => client },
    queries,
    get released() { return released; },
  };
}

test('recovery dry-run inspects candidates but never deletes or writes states', async () => {
  const db = database({ intents: [candidate()] });
  let deletes = 0;
  const result = await recoverShowcaseUploads(db.pool, {
    remove: async () => { deletes++; },
  });
  assert.deepEqual(result, { candidates: 1, referenced: 0, cleaned: 0, failures: 0, dryRun: true });
  assert.equal(deletes, 0);
  assert.equal(db.queries.some(q => q.sql.includes('UPDATE showcase_upload_intents')), false);
  assert.equal(db.released, 1);
});

test('recovery preserves referenced application previews', async () => {
  const db = database({ intents: [candidate()], referenced: true });
  let deletes = 0;
  const result = await recoverShowcaseUploads(db.pool, {
    dryRun: false, remove: async () => { deletes++; },
  });
  assert.equal(result.referenced, 1);
  assert.equal(result.cleaned, 0);
  assert.equal(deletes, 0);
});

test('recovery exits without scanning or deleting when advisory lock is held', async () => {
  const db = database({ intents: [candidate()], lock: false });
  let deletes = 0;
  const result = await recoverShowcaseUploads(db.pool, {
    dryRun: false, remove: async () => { deletes++; },
  });
  assert.equal(result.locked, true);
  assert.equal(deletes, 0);
  assert.equal(db.queries.some(q => q.sql.includes('FROM showcase_upload_intents')), false);
  assert.ok(db.queries.some(q => q.sql === 'ROLLBACK'));
});

test('recovery deletes only unreferenced candidates and marks them cleaned', async () => {
  const db = database({ intents: [candidate()] });
  const deleted = [];
  const result = await recoverShowcaseUploads(db.pool, {
    dryRun: false, remove: async key => { deleted.push(key); },
  });
  assert.equal(result.cleaned, 1);
  assert.deepEqual(deleted, [candidate().object_key]);
  assert.ok(db.queries.some(q => q.sql.includes("state='cleaned'")));
  assert.ok(db.queries.some(q => q.sql === 'COMMIT'));
});

test('recovery records failed deletion and leaves candidate for retry', async () => {
  const db = database({ intents: [candidate()] });
  const result = await recoverShowcaseUploads(db.pool, {
    dryRun: false, remove: async () => { throw new Error('Blob unavailable'); },
  });
  assert.equal(result.failures, 1);
  assert.equal(result.cleaned, 0);
  assert.ok(db.queries.some(q => q.sql.includes("state='cleanup_required'")));
});

test('recovery rolls back and releases client when database update fails', async () => {
  const db = database({ intents: [candidate()], failUpdate: true });
  await assert.rejects(recoverShowcaseUploads(db.pool, {
    dryRun: false, remove: async () => {},
  }), /update failed/);
  assert.ok(db.queries.some(q => q.sql === 'ROLLBACK'));
  assert.equal(db.released, 1);
});

test('recovery rejects invalid batch sizes before opening a connection', async () => {
  const db = database();
  for (const limit of [0, 21, -1, 1.5]) {
    await assert.rejects(recoverShowcaseUploads(db.pool, { limit }), TypeError);
  }
  assert.equal(db.queries.length, 0);
});
