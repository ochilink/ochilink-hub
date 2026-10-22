import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmokeTestHandler, smokeTestEnabled } from '../api/_admin-live-smoke-test.js';
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

test('checkout retry after Stripe timeout reuses one reserved id and idempotency key', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const actor = '22222222-2222-4222-8222-222222222222';
  let reserved = false;
  let open = false;
  let attempts = 0;
  const keys = [];
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('INSERT INTO hub_live_smoke_tests')) reserved = true;
      if (sql.includes('FROM hub_live_smoke_tests')) return { rows: reserved ? [{
        id, actor_id: actor, state: open ? 'checkout_open' : 'pending',
        checkout_url: open ? 'https://checkout.stripe.com/mock' : null,
      }] : [] };
      if (sql.includes('UPDATE hub_live_smoke_tests')) open = true;
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async query() { return { rows: [{ id: actor }] }; },
    async connect() { return client; },
  };
  const stripe = { checkout: { sessions: { async create(_payload, opts) {
    keys.push(opts.idempotencyKey);
    attempts++;
    if (attempts === 1) throw new Error('Stripe timeout');
    return { id: 'cs_live_mock', url: 'https://checkout.stripe.com/mock' };
  } } } };
  const handler = createSmokeTestHandler({
    env: live, poolProvider: () => pool, stripeProvider: () => stripe,
  });
  const authorized = { ...req, headers: {
    ...req.headers, cookie: 'ochi_session=' + 'a'.repeat(64),
  } };
  const originalError = console.error;
  console.error = () => {};
  try {
    const first = response();
    await handler(authorized, first);
    assert.equal(first.code, 503);
    const second = response();
    await handler(authorized, second);
    assert.equal(second.code, 201);
    const third = response();
    await handler(authorized, third);
    assert.equal(third.code, 200);
    assert.equal(third.body.checkout_url, second.body.checkout_url);
    assert.equal(keys.length, 2);
    assert.deepEqual(keys, ['ochilink-live-smoke-' + id, 'ochilink-live-smoke-' + id]);
    assert.equal(queries.filter(x => x.includes('INSERT INTO hub_live_smoke_tests')).length, 3);
  } finally {
    console.error = originalError;
  }
});

test('duplicate webhook event is ignored without mutating any payment record', async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.includes('INSERT INTO hub_payment_events')) return { rows: [] };
    throw new Error('Duplicate event must not query payment records');
  } };
  await processPaymentEvent(client, {
    id: 'evt_duplicate', type: 'checkout.session.completed',
    data: { object: { metadata: { ochilink_smoke_test_id: '11111111-1111-4111-8111-111111111111' } } },
  });
  assert.equal(calls.length, 1);
});

test('one-time smoke checkout refuses another administrator after reservation', async () => {
  const existingActor = '22222222-2222-4222-8222-222222222222';
  const requester = '33333333-3333-4333-8333-333333333333';
  let stripeCalls = 0;
  const client = {
    async query(sql) {
      if (sql.includes('FROM hub_live_smoke_tests')) return { rows: [{
        id: '11111111-1111-4111-8111-111111111111',
        actor_id: existingActor, state: 'pending',
      }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async query() { return { rows: [{ id: requester }] }; },
    async connect() { return client; },
  };
  const handler = createSmokeTestHandler({
    env: live, poolProvider: () => pool,
    stripeProvider: () => { stripeCalls++; throw new Error('Stripe must not be reached'); },
  });
  const res = response();
  await handler({ ...req, headers: {
    ...req.headers, cookie: 'ochi_session=' + 'a'.repeat(64),
  } }, res);
  assert.equal(res.code, 403);
  assert.equal(stripeCalls, 0);
});


test('ordinary refunds never query the smoke ledger', async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.includes('INSERT INTO hub_payment_events')) return { rows: [{}] };
    if (sql.includes('hub_live_smoke_tests')) throw new Error('Unexpected smoke ledger access');
    if (sql.includes('FROM hub_payments')) return { rows: [{ id: 'booking', consultation_id: 'consultation' }] };
    if (sql.includes('FROM consultations')) throw new Error('BOOKING_HANDLER_REACHED');
    return { rows: [] };
  } };
  const stripe = { paymentIntents: { async retrieve() {
    throw new Error('Known booking must not require Stripe lookup');
  } } };
  await assert.rejects(processPaymentEvent(client, {
    id: 'evt_booking_refund_isolation', type: 'charge.refunded',
    data: { object: { payment_intent: 'pi_booking', amount: 15000,
      amount_refunded: 15000, currency: 'usd' } },
  }, stripe), /BOOKING_HANDLER_REACHED/);
  assert.equal(calls.some(sql => sql.includes('hub_live_smoke_tests')), false);
});

test('marked smoke refund updates only its matching ledger record', async () => {
  const calls = [];
  const id = '11111111-1111-4111-8111-111111111111';
  const client = { async query(sql, args) {
    calls.push({ sql, args });
    if (sql.includes('INSERT INTO hub_payment_events')) return { rows: [{}] };
    if (sql.includes('FROM hub_payments')) return { rows: [] };
    if (sql.includes('FROM hub_live_smoke_tests')) {
      assert.deepEqual(args, [id, 'pi_smoke_refund']);
      return { rows: [{ id, amount_cents: 100, currency: 'usd', state: 'paid' }] };
    }
    return { rows: [] };
  } };
  const stripe = { paymentIntents: { async retrieve(intentId) {
    assert.equal(intentId, 'pi_smoke_refund');
    return { metadata: { ochilink_smoke_test_id: id } };
  } } };
  await processPaymentEvent(client, {
    id: 'evt_smoke_refund_isolation', type: 'charge.refunded',
    data: { object: { payment_intent: 'pi_smoke_refund', amount: 100,
      amount_refunded: 100, currency: 'usd' } },
  }, stripe);
  assert.equal(calls.some(x => x.sql.includes("UPDATE hub_live_smoke_tests SET state='refunded'")), true);
  assert.equal(calls.some(x => /UPDATE consultations|UPDATE hub_payments/.test(x.sql)), false);
  assert.equal(calls.some(x => x.sql.includes('LIVE_SMOKE_REFUNDED')), true);
});