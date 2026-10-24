import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('rental admin API is protected by the existing administrator session', () => {
  const api = fs.readFileSync(new URL('../api/hub.js', import.meta.url), 'utf8');
  const service = fs.readFileSync(new URL('../lib/rental-admin.js', import.meta.url), 'utf8');

  const userGate = api.indexOf("if (!user) fail(401");
  const adminGate = api.indexOf("if (user.role !== 'admin')");
  const rentalAdmin = api.indexOf("resource === 'rental-admin'");
  assert.ok(userGate > 0);
  assert.ok(adminGate > userGate);
  assert.ok(rentalAdmin > adminGate);
  assert.ok(service.includes("d.state='ready'"));
  assert.ok(service.includes('RENTAL_APPLICATION_STATUS_CHANGED'));
  assert.ok(service.includes("payment_status !== 'paid'"));
  assert.ok(service.includes('createPrivateDownloadUrl(row.pathname)'));
  assert.ok(service.includes('RENTAL_FEES_UPDATED'));
  assert.ok(service.includes('INSERT INTO rental_fee_history'));
});

test('rental admin workspace exposes review, status, fee and private document actions', () => {
  const page = fs.readFileSync(new URL('../public/admin/rentals/index.html', import.meta.url), 'utf8');
  const mainAdmin = fs.readFileSync(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  const linkScript = fs.readFileSync(new URL('../public/assets/hub-rental-admin-link.js', import.meta.url), 'utf8');
  const vercel = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

  assert.ok(page.includes("resource','rental-admin"));
  assert.ok(page.includes("api('status'"));
  assert.ok(page.includes('data-doc'));
  assert.ok(page.includes('Rental fee configuration'));
  assert.ok(page.includes('saveFees'));
  assert.ok(page.includes('Main Admin'));
  assert.ok(mainAdmin.includes('hub-rental-admin-link.js'));
  assert.ok(linkScript.includes('/admin/rentals/'));
  assert.ok(vercel.includes('"source": "/admin/rentals"'));
  assert.doesNotMatch(page, /Alex Morgan|Jamie Lee|Taylor Kim|mock/i);
});
