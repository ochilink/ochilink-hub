import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShowcaseRecoveryDiagnosticHandler } from '../api/showcase-recovery-diagnostic.js';

function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k,v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(v) { this.body = v; return this; },
  };
}
const secret = 'test-only-secret';
const authorized = { method: 'GET', headers: { authorization: 'Bearer ' + secret } };
test('Production diagnostic is unavailable before database access', async () => {
  let called = false;
  const handler = createShowcaseRecoveryDiagnosticHandler({
    env: { VERCEL_ENV: 'production', CRON_SECRET: secret },
    poolProvider: () => { called = true; },
  });
  const res = response();
  await handler(authorized, res);
  assert.equal(res.statusCode, 404);
  assert.equal(called, false);
});
test('Preview diagnostic requires a valid secret before database access', async () => {
  let called = false;
  const handler = createShowcaseRecoveryDiagnosticHandler({
    env: { VERCEL_ENV: 'preview', CRON_SECRET: secret },
    poolProvider: () => { called = true; },
  });
  for (const headers of [{}, { authorization: 'Bearer invalid' }]) {
    const res = response();
    await handler({ method: 'GET', headers }, res);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(called, false);
});
test('Authorized Preview diagnostic returns dry-run counts only', async () => {
  let calls = 0;
  const handler = createShowcaseRecoveryDiagnosticHandler({
    env: { VERCEL_ENV: 'preview', CRON_SECRET: secret },
    poolProvider: () => ({}),
    observe: async () => {
      calls++;
      return { status: 'observed', candidates: 2, referenced: 1, dryRun: true };
    },
  });
  const res = response();
  await handler(authorized, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.recovery.dryRun, true);
  assert.equal(res.body.recovery.candidates, 2);
  assert.equal(calls, 1);
});
test('Diagnostic fails safely when observer fails', async () => {
  const handler = createShowcaseRecoveryDiagnosticHandler({
    env: { VERCEL_ENV: 'preview', CRON_SECRET: secret },
    poolProvider: () => ({}),
    observe: async () => { throw new Error('private database detail'); },
  });
  const res = response();
  await handler(authorized, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'Recovery observation unavailable.' });
});
