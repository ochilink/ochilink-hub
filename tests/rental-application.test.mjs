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
  assert.match(page, /sessionStorage\.setItem\("ochi_rental_thank_you"/);
  assert.ok(page.includes('location.assign("/rental-application/thank-you/")'));
  assert.match(page, /Start Application/);
  assert.doesNotMatch(page, /children:\"Start as Guest\"/);
});


test('payment return canonicalizes before customer session exchange', () => {
  const html = fs.readFileSync(new URL('../public/rental-application/index.html', import.meta.url), 'utf8');
  const canonicalIndex = html.indexOf("resource=canonical-origin");
  const returnedIndex = html.indexOf("payment')==='returned");
  const statusIndex = html.indexOf("resource=rental&action=status");
  const exchangeIndex = html.indexOf("customer-auth&action=exchange-application");
  assert.ok(canonicalIndex >= 0);
  assert.ok(returnedIndex >= 0);
  assert.ok(statusIndex > canonicalIndex);
  assert.ok(exchangeIndex > canonicalIndex);
});


test('rental mobile header uses two rows and keeps sign out in the drawer', () => {
  const page = fs.readFileSync(new URL('../public/rental-application/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../public/assets/hub-rental.css', import.meta.url), 'utf8');
  assert.match(page, /rental-header/);
  assert.match(page, /rental-header-logo/);
  assert.match(page, /rental-header-actions/);
  assert.match(page, /rental-header-signout/);
  assert.match(page, /rental-drawer-signout/);
  assert.match(css, /grid-template-areas:[\s\S]*"brand brand"[\s\S]*"menu actions"/);
  assert.match(css, /\.rental-header-signout\s*\{[\s\S]*display:none !important/);
});


test('rental dark mode keeps date controls and green status text readable', () => {
  const css = fs.readFileSync(new URL('../public/assets/hub-rental.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-theme=dark\][\s\S]*--green-dark:#A7E99A/);
  assert.match(css, /\[data-theme=dark\] input\[type="date"\][\s\S]*color-scheme:dark/);
  assert.match(css, /\[data-theme=dark\] input\[type="date"\]::-webkit-calendar-picker-indicator\s*\{[\s\S]*background-image:url\("data:image\/svg\+xml/);
});


test('rental date picker uses explicit theme-aware calendar icons', () => {
  const css = fs.readFileSync(new URL('../public/assets/hub-rental.css', import.meta.url), 'utf8');
  assert.match(css, /stroke='%230F172A'/);
  assert.match(css, /stroke='%23F8FAFC'/);
  assert.match(css, /\[data-theme=dark\] input\[type="date"\]::-webkit-calendar-picker-indicator/);
});


test('final rental pay button uses dark text only in dark mode', () => {
  const page = fs.readFileSync(new URL('../public/rental-application/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../public/assets/hub-rental.css', import.meta.url), 'utf8');
  assert.match(page, /rental-pay-submit-btn/);
  assert.match(css, /\[data-theme=dark\] \.rental-pay-submit-btn\s*\{[\s\S]*color:#0F172A !important/);
});
