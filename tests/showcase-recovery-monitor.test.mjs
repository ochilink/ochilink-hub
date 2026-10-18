import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observeShowcaseRecovery } from '../lib/showcase-recovery-monitor.js';

const logger = { info() {}, error() {} };
test('Production never invokes showcase recovery observation', async () => {
  let called = false;
  const result = await observeShowcaseRecovery({}, {
    env: { VERCEL_ENV: 'production' },
    recover: async () => { called = true; },
    logger,
  });
  assert.deepEqual(result, { status: 'disabled' });
  assert.equal(called, false);
});
test('Preview uses a bounded dry run and returns safe counts', async () => {
  let options;
  const result = await observeShowcaseRecovery({}, {
    env: { VERCEL_ENV: 'preview' },
    recover: async (_pool, value) => {
      options = value;
      return { candidates: 3, referenced: 1, cleaned: 0, dryRun: true };
    },
    logger,
  });
  assert.deepEqual(options, { dryRun: true, limit: 5 });
  assert.deepEqual(result, { status: 'observed', candidates: 3, referenced: 1, dryRun: true });
});
test('Recovery errors are isolated and do not expose exception details', async () => {
  const result = await observeShowcaseRecovery({}, {
    env: { VERCEL_ENV: 'preview' },
    recover: async () => { throw new Error('secret detail'); },
    logger,
  });
  assert.deepEqual(result, { status: 'failed' });
});
test('Locked worker reports lock status without destructive operations', async () => {
  const result = await observeShowcaseRecovery({}, {
    env: { VERCEL_ENV: 'preview' },
    recover: async () => ({ locked: true, candidates: 0, referenced: 0 }),
    logger,
  });
  assert.equal(result.status, 'locked');
  assert.equal(result.dryRun, true);
});
