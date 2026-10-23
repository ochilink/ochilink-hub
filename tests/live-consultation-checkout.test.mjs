import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkout } from '../lib/payments.js';

const TOKEN = 'safe-local-test-token';
const consultationId = '11111111-1111-4111-8111-111111111111';
const paymentId = '22222222-2222-4222-8222-222222222222';

function fixtures({ amount = 150, existingSession = null } = {}) {
  const calls = [];
  const row = {
    id: consultationId,
    client_email: 'example@example.invalid',
    status: 'Requested',
    payment_status: 'Unpaid',
    amount,
    currency: 'USD',
    payment_version: 1,
    checkout_required: false,
  };
  const payment = {
    id: paymentId,
    consultation_id: consultationId,
    version: 1,
    amount_cents: Math.round(amount * 100),
    currency: 'usd',
    state: 'pending',
    session_id: existingSession,
    created_at: new Date(),
  };
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('FROM consultations WHERE manage_token_hash')) return { rows: [row] };
      if (sql.includes('INSERT INTO hub_payments')) return { rows: [payment] };
      if (sql.includes('UPDATE hub_payments SET session_id')) return { rows: [], rowCount: 1 };
      throw new Error('Unexpected SQL in payment regression test: ' + sql);
    },
  };
  return { client, calls };
}

test('regular consultation checkout uses the database quote, not browser-supplied pricing', async () => {
  const { client, calls } = fixtures({ amount: 225 });
  const created = [];
  const stripe = {
    checkout: { sessions: {
      async create(params, opts) {
        created.push({ params, opts });
        return { id: 'cs_test_mock', url: 'https://checkout.stripe.com/mock' };
      },
    } },
  };
  const result = await checkout(client, TOKEN, stripe);
  assert.equal(result.url, 'https://checkout.stripe.com/mock');
  assert.equal(created.length, 1);
  assert.equal(created[0].params.mode, 'payment');
  assert.equal(created[0].params.line_items[0].price_data.unit_amount, 22500);
  assert.equal(created[0].params.line_items[0].price_data.currency, 'usd');
  assert.equal(created[0].params.metadata.consultation_id, consultationId);
  assert.equal(created[0].opts.idempotencyKey, 'ochilink-consultation-' + consultationId + '-1');
  assert.equal(calls.some(x => x.sql.includes('UPDATE hub_payments SET session_id')), true);
});

test('existing open Checkout session is reused without creating another', async () => {
  const { client } = fixtures({ existingSession: 'cs_existing_mock' });
  let created = 0;
  const stripe = { checkout: { sessions: {
    async retrieve(id) {
      assert.equal(id, 'cs_existing_mock');
      return { status: 'open', url: 'https://checkout.stripe.com/existing' };
    },
    async create() { created++; throw new Error('Must not create duplicate Checkout'); },
  } } };
  const result = await checkout(client, TOKEN, stripe);
  assert.equal(result.url, 'https://checkout.stripe.com/existing');
  assert.equal(created, 0);
});

test('already paid payment is never sent to Stripe again', async () => {
  const { client } = fixtures();
  const original = client.query;
  client.query = async (sql, params) => {
    const result = await original(sql, params);
    if (sql.includes('INSERT INTO hub_payments')) result.rows[0].state = 'paid';
    return result;
  };
  await assert.rejects(checkout(client, TOKEN, { checkout: { sessions: {
    async create() { throw new Error('Stripe must not be called'); },
  } } }), /no longer active/);
});
