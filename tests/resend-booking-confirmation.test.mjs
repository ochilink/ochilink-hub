import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('admin resend confirmation action is authenticated and rebuilds branded mail', () => {
  const source = fs.readFileSync(new URL('../lib/features.js', import.meta.url), 'utf8');
  const authIndex = source.indexOf('authenticated();');
  const actionIndex = source.indexOf("body.action === 'resend-booking-confirmation'");
  assert.ok(authIndex >= 0);
  assert.ok(actionIndex > authIndex);
  assert.match(source, /bookingConfirmationHtml\(/);
  assert.match(source, /BOOKING_CONFIRMATION_RESENT/);
  assert.match(source, /c\.payment_status='Paid'/);
  assert.match(source, /c\.status IN \('Scheduled','Completed'\)/);
});

test('admin UI exposes resend only for paid scheduled or completed consultations', () => {
  const source = fs.readFileSync(
    new URL('../public/assets/hub-features.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /editor\.payment_status === 'Paid'/);
  assert.match(source, /\['Scheduled', 'Completed'\]\.includes\(editor\.status\)/);
  assert.match(source, /Resend confirmation/);
  assert.match(source, /resend-booking-confirmation/);
});
