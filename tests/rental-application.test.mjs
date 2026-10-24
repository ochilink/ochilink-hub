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
  assert.match(api, /resource === 'rental'/);
  assert.match(api, /createRentalCheckout/);
  assert.match(payments, /processRentalPaymentEvent/);
  assert.match(migration, /data_encrypted TEXT NOT NULL/);
  assert.match(migration, /rental_application_documents/);
  assert.doesNotMatch(rental, /Access-Control-Allow-Origin.*\*/);
});

test('rental application page is wired to Hub fees and checkout APIs', () => {
  const page = fs.readFileSync(new URL('../public/rental-application/index.html', import.meta.url), 'utf8');
  assert.match(page, /\/api\/rental\?action=fees/);
  assert.match(page, /\/api\/rental\?action=submit/);
  assert.match(page, /\/api\/rental\?action=status/);
  assert.match(page, /hub-rental\.css/);
  assert.doesNotMatch(page, /no server call made/i);
});
