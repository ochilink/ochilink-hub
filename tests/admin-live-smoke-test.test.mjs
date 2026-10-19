import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmokeTestHandler, smokeTestEnabled } from '../api/admin-live-smoke-test.js';
import { processPaymentEvent } from '../lib/payments.js';

const live = { VERCEL_ENV: 'production', ADMIN_LIVE_SMOKE_TEST_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_live_mock_only', STRIPE_WEBHOOK_SECRET: 'whsec_mock_only' };
function response() {
  return { code: 200, body: null, headers: {},
    setHeader(k,v) { this.headers[k] = v; },
    status(n) { this.code = n; return this; },
    json(v) { this.body = v; return this; },
  };
}
const req = { method: 'POST', headers: { host: 'ochilink.com', origin: 'https://ochilink.com',
  'content-type': 'application/json' }, body: {} };

test('one-dollar smoke checkout is disabled by default and rejects test-mode keys', async () => {
  assert.equal(smokeTestEnabled({ ...live, ADMIN_LIVE_SMOKE_TEST_ENABLED: undefined }), false);
  assert.equal(smokeTestEnabled({ ...live, STRIPE_SECRET_KEY: 'sk_test_mock' }), false);
  assert.equal(smokeTestEnabled({ ...live, VERCEL_ENV: 'preview' }), false);
  const res = response();
  await createSmokeTestHandler({ env: { ...live, ADMIN_LIVE_SMOKE_TEST_ENABLED: undefined },
    poolProvider: () => { throw new Error('must not connect'); } })(req, res);
  assert.equal(res.code, 404);
});
test('smoke checkout rejects unauthenticated and cross-origin requests before database access', async () => {
  const handler = createSmokeTestHandler({ env: live, poolProvider: () => {
    throw new Error('must not connect');
  } });
  const unauth = response();
  await handler(req, unauth);
  assert.equal(unauth.code, 401);
  const foreign = response();
  await handler({ ...req, headers: { ...req.headers, origin: 'https://evil.invalid' } }, foreign);
  assert.equal(foreign.code, 403);
});
test('smoke event updates only the isolated ledger and audits the outcome', async () => {
  const calls = [];
  const client = { async query(sql, args) {
    calls.push({ sql, args });
    if (sql.includes('INSERT INTO hub_payment_events')) return { rows: [{ event_id: 'evt_smoke' }] };
    if (sql.includes('FROM hub_live_smoke_tests')) return { rows: [{
      id: '11111111-1111-4111-8111-111111111111',
      amount_cents: 100, currency: 'usd', state: 'checkout_open',
    }] };
    return { rows: [] };
  } };
  await processPaymentEvent(client, {
    id: 'evt_smoke', type: 'checkout.session.completed',
    data: { object: { id: 'cs_live_smoke', amount_total: 100, currency: 'usd',
      payment_status: 'paid', payment_intent: 'pi_smoke',
      metadata: { ochilink_smoke_test_id: '11111111-1111-4111-8111-111111111111' } } },
  });
  assert.equal(calls.some(x => x.sql.includes('UPDATE hub_live_smoke_tests')), true);
  assert.equal(calls.some(x => /UPDATE consultations|UPDATE hub_payments/.test(x.sql)), false);
});
test('smoke event rejects amount mismatch before any payment update', async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.includes('INSERT INTO hub_payment_events')) return { rows: [{ event_id: 'evt_wrong' }] };
    if (sql.includes('FROM hub_live_smoke_tests')) return { rows: [{
      amount_cents: 100, currency: 'usd', state: 'checkout_open',
    }] };
    return { rows: [] };
  } };
  await assert.rejects(processPaymentEvent(client, {
    id: 'evt_wrong', type: 'checkout.session.completed',
    data: { object: { id: 'cs_wrong', amount_total: 15000, currency: 'usd',
      payment_status: 'paid', metadata: { ochilink_smoke_test_id: '11111111-1111-4111-8111-111111111111' } } },
  }), /SMOKE_PAYMENT_MISMATCH/);
  assert.equal(calls.some(x => x.includes('UPDATE hub_live_smoke_tests')), false);
});
