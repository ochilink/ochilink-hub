import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingConfirmationHtml,
  paymentReceivedHtml,
  adminPaidBookingHtml,
} from '../lib/mail.js';

test('booking confirmation email is branded, structured and responsive', () => {
  const html = bookingConfirmationHtml({
    date: 'Tuesday, December 1, 2026 at 10:00 AM EST',
    durationMinutes: 60,
    amount: '150.00',
    currency: 'USD',
    reference: 'booking-123',
    bookingUrl: 'https://ochilink.com/booking',
  });

  assert.match(html, /ochi<span style="color:#00FFC6">link<\/span>/);
  assert.match(html, /Your Ochilink session is confirmed/);
  assert.match(html, /Booking summary/);
  assert.match(html, /Tuesday, December 1, 2026 at 10:00 AM EST/);
  assert.match(html, /60 minutes/);
  assert.match(html, /USD 150\.00/);
  assert.match(html, /booking-123/);
  assert.match(html, /href="https:\/\/ochilink\.com\/booking"/);
  assert.match(html, /viewport/);
});

test('booking templates escape customer-controlled values', () => {
  const html = adminPaidBookingHtml({
    clientEmail: '<script>alert(1)</script>@example.test',
    date: '<b>today</b>',
    durationMinutes: 60,
    amount: '75.00',
    currency: 'USD',
    reference: '<img src=x onerror=alert(1)>',
    adminUrl: 'https://ochilink.com/admin/',
  });

  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('<img src=x onerror=alert(1)>'), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /href="https:\/\/ochilink\.com\/admin\/"/);
});

test('payment receipt template preserves plain payment details and CTA', () => {
  const html = paymentReceivedHtml({
    amount: '39.99',
    currency: 'USD',
    reference: 'ref-456',
    siteUrl: 'https://ochilink.com',
  });

  assert.match(html, /We received your payment/);
  assert.match(html, /USD 39\.99/);
  assert.match(html, /ref-456/);
  assert.match(html, /Visit Ochilink/);
});
