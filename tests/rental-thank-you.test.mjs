import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('rental thank-you page is branded and offers PDF/account actions', () => {
  const html=fs.readFileSync(new URL('../public/rental-application/thank-you/index.html', import.meta.url),'utf8');
  assert.match(html,/ochilink-final-logo\.svg/);
  assert.match(html,/Download Application PDF/);
  assert.match(html,/Open My Account/);
  assert.match(html,/jspdf/i);
  assert.match(html,/ochi_rental_thank_you/);
});

test('paid rental return redirects to thank-you after account exchange', () => {
  const html=fs.readFileSync(new URL('../public/rental-application/index.html', import.meta.url),'utf8');
  assert.match(html,/sessionStorage\.setItem\("ochi_rental_thank_you"/);
  assert.match(html,/location\.assign\("\/rental-application\/thank-you\/"\)/);
});
