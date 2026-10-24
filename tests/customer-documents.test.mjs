import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('customer document service scopes every file operation to the signed-in customer', () => {
  const docs = fs.readFileSync(new URL('../lib/documents.js', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../api/hub.js', import.meta.url), 'utf8');
  const customer = fs.readFileSync(new URL('../lib/customer.js', import.meta.url), 'utf8');

  assert.match(api, /currentCustomer\(pool, req\)/);
  assert.match(api, /resource === 'customer-documents'/);
  assert.match(docs, /d\.customer_id=\$1/);
  assert.match(docs, /customer_id=\$2/);
  assert.match(docs, /rental_applications WHERE id=\$1 AND customer_id=\$2/);
  assert.match(docs, /customer_folders WHERE id=\$1 AND customer_id=\$2/);
  assert.match(docs, /createPrivateDownloadUrl\(row\.pathname\)/);
  assert.match(docs, /createPrivateUploadUrl/);
  assert.match(customer, /HttpOnly; Secure; SameSite=Strict/);
});

test('customer account UI uses real Hub account and document APIs', () => {
  const page = fs.readFileSync(new URL('../public/account/index.html', import.meta.url), 'utf8');
  const vercel = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

  assert.match(page, /resource','customer-auth/);
  assert.match(page, /resource','customer-documents/);
  assert.match(page, /begin-upload/);
  assert.match(page, /complete-upload/);
  assert.match(page, /data-download/);
  assert.match(page, /exchange-application/);
  assert.match(vercel, /"source": "\/account"/);
  assert.doesNotMatch(page, /Q3 Financial Report|Brand Guidelines|Customer List/);
});
