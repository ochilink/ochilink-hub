import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('payments and booking maintenance baseline preserves core safeguards', () => {
  const payments = fs.readFileSync(new URL('../lib/payments.js', import.meta.url), 'utf8');
  const scheduling = fs.readFileSync(new URL('../lib/scheduling.js', import.meta.url), 'utf8');
  const webhook = fs.readFileSync(new URL('../api/stripe-webhook.js', import.meta.url), 'utf8');
  const maintenance = fs.readFileSync(new URL('../api/maintenance.js', import.meta.url), 'utf8');

  assert.match(payments, /idempotencyKey:/);
  assert.match(payments, /ochilink-consultation-/);
  assert.match(payments, /35\*60/);
  assert.match(payments, /checkout\.session\.expired/);
  assert.match(payments, /checkout\.session\.async_payment_failed/);
  assert.match(payments, /PAYMENT_RECORD_MISMATCH/);
  assert.match(payments, /payment\.amount_cents !== object\.amount_total/);
  assert.match(payments, /payment\.currency !== object\.currency/);
  assert.match(payments, /reconcileBookingPayments/);
  assert.match(payments, /state='pending'/);
  assert.match(payments, /THEN 'Scheduled' ELSE status END/);
  assert.match(payments, /PAYMENT_REQUIRES_REVIEW/);

  assert.match(webhook, /constructEvent/);
  assert.match(webhook, /STRIPE_WEBHOOK_SECRET/);
  assert.match(maintenance, /reconcileBookingPayments/);
  assert.match(maintenance, /CRON_SECRET/);
  assert.match(scheduling, /reserved_until/);
  assert.match(scheduling, /hub_payments/);
  assert.match(scheduling, /state='pending'/);
});

test('payments and booking maintenance documentation records current guardrails', () => {
  const doc = fs.readFileSync(new URL('../docs/PAYMENTS_BOOKING_MAINTENANCE.md', import.meta.url), 'utf8');
  assert.match(doc, /35 minutes/);
  assert.match(doc, /stable Stripe idempotency key/);
  assert.match(doc, /browser redirect from Checkout must never mark a consultation paid/);
  assert.match(doc, /unknown Stripe outcomes retain the hold/);
  assert.match(doc, /checkout\.session\.expired/);
  assert.match(doc, /charge\.refunded/);
  assert.match(doc, /Do not weaken these controls/);
});
