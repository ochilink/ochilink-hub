import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createShowcaseIntent, setShowcaseIntentState, reconcileShowcaseIntent,
} from '../lib/showcase-intents.js';

const id = '11111111-1111-4111-8111-111111111111';
const key = 'showcases/22222222-2222-4222-8222-222222222222.html';

test('upload intent must be persisted before storage is attempted', async () => {
  const calls = [];
  const pool = { async query(sql, args) {
    calls.push({ sql, args });
    return { rows: [{ intent_id: id }] };
  } };
  assert.equal(await createShowcaseIntent(pool, { appId: id, actorId: id, objectKey: key }), id);
  assert.match(calls[0].sql, /INSERT INTO showcase_upload_intents/);
  assert.equal(calls[0].args[3], key);
});

test('upload intent state changes are restricted and checked', async () => {
  const pool = { async query(sql, args) {
    assert.match(sql, /UPDATE showcase_upload_intents/);
    assert.equal(args[1], 'cleanup_required');
    return { rowCount: 1 };
  } };
  await setShowcaseIntentState(pool, id, 'cleanup_required', 'UPLOAD_FAILED');
  await assert.rejects(setShowcaseIntentState(pool, id, 'pending'), TypeError);
  await assert.rejects(setShowcaseIntentState({ query: async () => ({ rowCount: 0 }) }, id, 'cleaned'));
});

test('reconciliation never deletes a referenced preview', async () => {
  let deleted = false;
  const pool = { query: async () => ({ rows: [{ '?column?': 1 }] }) };
  const result = await reconcileShowcaseIntent(pool, { intent_id: id, object_key: key, state: 'pending' },
    async () => { deleted = true; });
  assert.equal(result.reason, 'referenced');
  assert.equal(deleted, false);
});

test('reconciliation removes an unreferenced orphan and marks it cleaned', async () => {
  const events = [];
  const pool = { async query(sql) {
    events.push(sql);
    return sql.includes('SELECT 1') ? { rows: [] } : { rowCount: 1 };
  } };
  const result = await reconcileShowcaseIntent(pool,
    { intent_id: id, object_key: key, state: 'cleanup_required' },
    async (objectKey) => { assert.equal(objectKey, key); events.push('delete'); });
  assert.deepEqual(result, { cleaned: true });
  assert.equal(events[1], 'delete');
  assert.match(events[2], /UPDATE showcase_upload_intents/);
});

test('failed orphan deletion leaves intent pending for retry', async () => {
  const events = [];
  const pool = { async query(sql) { events.push(sql); return { rows: [] }; } };
  await assert.rejects(reconcileShowcaseIntent(pool,
    { intent_id: id, object_key: key, state: 'cleanup_required' },
    async () => { throw new Error('storage unavailable'); }), /storage unavailable/);
  assert.equal(events.length, 1);
});
