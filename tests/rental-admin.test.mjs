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
  assert.match(service, /WHERE r.id=$1 AND d.id=$2 AND d.state='ready'/);
  assert.match(service, /RENTAL_APPLICATION_STATUS_CHANGED/);
  assert.match(service, /payment_status !== 'paid'/);
  assert.match(service, /createPrivateDownloadUrl(row.pathname)/);
});

test('rental admin workspace exposes review, status and private document actions', () => {
  const page = fs.readFileSync(new URL('../public/admin/rentals/index.html', import.meta.url), 'utf8');
  const mainAdmin = fs.readFileSync(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  const linkScript = fs.readFileSync(new URL('../public/assets/hub-rental-admin-link.js', import.meta.url), 'utf8');
  const vercel = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

  assert.match(page, /resource','rental-admin/);
  assert.match(page, /action','status/);
  assert.match(page, /data-doc/);
  assert.match(page, /Main Admin/);
  assert.match(mainAdmin, /hub-rental-admin-link.js/);
  assert.match(linkScript, //admin/rentals//);
  assert.match(vercel, /"source": "\/admin\/rentals"/);
  assert.doesNotMatch(page, /Alex Morgan|Jamie Lee|Taylor Kim|mock/i);
});
