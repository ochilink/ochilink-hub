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

  assert.match(page, /request\('customer-auth'/);
  assert.match(page, /request\('customer-documents'/);
  assert.match(page, /begin-upload/);
  assert.match(page, /complete-upload/);
  assert.match(page, /data-download/);
  assert.match(page, /exchange-application/);
  assert.match(vercel, /"source": "\/account"/);
  assert.doesNotMatch(page, /Q3 Financial Report|Brand Guidelines|Customer List/);
});


test('private Blob authorizations and one-time rental account tokens stay constrained', () => {
  const blob = fs.readFileSync(new URL('../lib/blob-storage.js', import.meta.url), 'utf8');
  const customer = fs.readFileSync(new URL('../lib/customer.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../database/migrations/014_rental_application.sql', import.meta.url), 'utf8');
  const maintenance = fs.readFileSync(new URL('../api/maintenance.js', import.meta.url), 'utf8');

  assert.match(blob, /\.private\.blob\.vercel-storage\.com/);
  assert.match(blob, /\/signed-token/);
  assert.match(blob, /operations: \['put'\]/);
  assert.match(blob, /operations: \['get'\]/);
  assert.match(blob, /15 \* 60 \* 1000/);
  assert.match(blob, /5 \* 60 \* 1000/);
  assert.match(customer, /access_token_expires_at>now\(\)/);
  assert.match(customer, /access_token_used_at IS NULL/);
  assert.match(customer, /access_token_used_at=now\(\)/);
  assert.match(migration, /access_token_expires_at/);
  assert.match(migration, /customer_documents/);
  assert.match(maintenance, /DELETE FROM customer_sessions WHERE expires_at<now\(\)/);
  assert.match(maintenance, /DELETE FROM customer_magic_links/);
});

test('customer portal supports approved rental document types without demo files', () => {
  const page = fs.readFileSync(new URL('../public/account/index.html', import.meta.url), 'utf8');
  const docs = fs.readFileSync(new URL('../lib/documents.js', import.meta.url), 'utf8');

  assert.match(page, /text\/markdown/);
  assert.match(page, /x-vercel-blob-access':'private/);
  assert.match(page, /Storage returned an unexpected document path/);
  assert.match(docs, /application\/pdf/);
  assert.match(docs, /text\/markdown/);
  assert.match(docs, /image\/jpeg/);
  assert.match(docs, /video\/mp4/);
  assert.match(docs, /500 \* 1024 \* 1024/);
  assert.match(docs, /d\.state='ready'/);
  assert.doesNotMatch(page, /1,284|Q3 Financial Report|Brand Guidelines|Customer List/);
});
