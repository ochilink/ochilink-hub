import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('rental application uses encrypted persistence and server-controlled Stripe checkout', () => {
  const rental = fs.readFileSync(new URL('../lib/rental.js', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../api/hub.js', import.meta.url), 'utf8');
  const payments = fs.readFileSync(new URL('../lib/payments.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/014_rental_application.sql', import.meta.url), 'utf8');

  assert.match(rental, /seal\(v\.serialized\)/);
  assert.match(rental, /SELECT \* FROM rental_fee_config WHERE id=1/);
  assert.match(rental, /unit_amount: fees\.total_cents/);
  assert.match(rental, /idempotencyKey: `ochilink-rental-/);
  assert.match(rental, /RENTAL_PAYMENT_RECORD_MISMATCH/);
  assert.match(rental, /Number\(app\.total_cents\) !== Number\(object\.amount_total\)/);
  assert.match(rental, /app\.currency !== object\.currency/);
  assert.match(rental, /status='submitted',payment_status='paid'/);
  assert.match(rental, /ensureCustomerForApplication/);
  assert.match(rental, /RENTAL_REFUND_RECORD_MISMATCH/);
  assert.match(rental, /RENTAL_PAYMENT_REFUNDED/);
  assert.match(payments, /event\.type === 'charge\.refunded'/);
  assert.match(payments, /rental_application_id/);
  assert.match(api, /resource === 'rental'/);
  assert.match(api, /createRentalCheckout/);
  assert.match(payments, /processRentalPaymentEvent/);
  assert.match(migration, /data_encrypted TEXT NOT NULL/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS customer_documents/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS customer_accounts/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS customer_id/);
  assert.doesNotMatch(rental, /Access-Control-Allow-Origin.*\*/);
});

test('rental application page is wired to Hub fees and checkout APIs', () => {
  const page = fs.readFileSync(new URL('../public/rental-application/index.html', import.meta.url), 'utf8');
  assert.ok(page.includes('/api/hub?resource=rental&action=fees'));
  assert.ok(page.includes('/api/hub?resource=rental&action=submit'));
  assert.ok(page.includes('/api/hub?resource=rental&action=status'));
  assert.match(page, /hub-rental\.css/);
  assert.doesNotMatch(page, /no server call made/i);
  assert.match(page, /Open My Account/);
  assert.match(page, /location\.assign\("\/account\/"\)/);
  assert.match(page, /CUSTOMER|customer-auth/);
  assert.match(page, /payment_status===\"paid\"/);
  assert.match(page, /sessionStorage\.setItem\("ochi_rental_thank_you"/);\n  assert.match(page, /location\.assign\("\\/rental-application\\/thank-you\\/"\)/);
  assert.match(page, /Start Application/);
  assert.doesNotMatch(page, /children:\"Start as Guest\"/);
});
