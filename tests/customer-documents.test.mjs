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
  const activation = fs.readFileSync(new URL('../database/migrations/015_activate_rental_document_apps.sql', import.meta.url), 'utf8');
  const maintenance = fs.readFileSync(new URL('../api/maintenance.js', import.meta.url), 'utf8');

  assert.match(blob, /\.private\.blob\.vercel-storage\.com/);
  assert.match(blob, /\/signed-token/);
  assert.match(blob, /operations: \['put'\]/);
  assert.match(blob, /operations: \['get'\]/);
  assert.match(blob, /operations: \['head'\]/);
  assert.match(blob, /15 \* 60 \* 1000/);
  assert.match(blob, /5 \* 60 \* 1000/);
  assert.match(customer, /access_token_expires_at>now\(\)/);
  assert.match(customer, /access_token_used_at IS NULL/);
  assert.match(customer, /access_token_used_at=now\(\)/);
  assert.match(migration, /access_token_expires_at/);
  assert.match(migration, /customer_documents/);
  assert.doesNotMatch(migration, /ochilink-rental-application/);
  assert.doesNotMatch(migration, /ochilink-document-storage/);
  assert.match(activation, /ochilink-rental-application/);
  assert.match(activation, /https:\/\/ochilink\.com\/rental-application\//);
  assert.match(activation, /ochilink-document-storage/);
  assert.match(activation, /https:\/\/ochilink\.com\/account\//);
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


test('rental documents are categorized and returned with application checklist data', () => {
  const migration = fs.readFileSync(new URL('../database/migrations/014_rental_application.sql', import.meta.url), 'utf8');
  const docs = fs.readFileSync(new URL('../lib/documents.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../public/account/index.html', import.meta.url), 'utf8');

  assert.ok(migration.includes('document_type TEXT NOT NULL'));
  assert.ok(migration.includes("'identity','income','bank_statement','employment','rental_history','other'"));
  assert.ok(docs.includes('allowedDocumentTypes'));
  assert.ok(docs.includes('application_checklists'));
  assert.ok(docs.includes('document_type'));
  assert.ok(page.includes('documentTypeSelect'));
  assert.ok(page.includes('checklistFor'));
  assert.ok(page.includes('Bank Statement'));
  assert.ok(page.includes('Rental History'));
});

test('document completion verifies the private Blob before marking metadata ready', () => {
  const docs = fs.readFileSync(new URL('../lib/documents.js', import.meta.url), 'utf8');
  const blob = fs.readFileSync(new URL('../lib/blob-storage.js', import.meta.url), 'utf8');

  assert.match(docs, /createPrivateHeadUrl\(pathname\)/);
  assert.match(docs, /method: 'HEAD'/);
  assert.match(docs, /content-length/);
  assert.match(docs, /content-type/);
  assert.match(docs, /Uploaded file size does not match the authorized upload/);
  assert.match(docs, /Uploaded file type does not match the authorized upload/);
  assert.match(blob, /sign\(issued\.clientSigningToken, 'head', pathname/);
  assert.match(blob, /2 \* 60 \* 1000/);
});


test('signed-in customer account owns rental PDF download action', () => {
  const account = fs.readFileSync(new URL('../public/account/index.html', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../api/hub.js', import.meta.url), 'utf8');
  const rental = fs.readFileSync(new URL('../lib/rental.js', import.meta.url), 'utf8');
  assert.match(account, /data-app-pdf/);
  assert.match(account, /Download PDF/);
  assert.match(account, /jspdf/i);
  assert.match(api, /action === 'rental'/);
  assert.match(rental, /customerRentalApplication/);
  assert.match(rental, /customer_id=\$2/);
});


test('rental PDF includes full submitted application sections', () => {
  const account = fs.readFileSync(new URL('../public/account/index.html', import.meta.url), 'utf8');
  for (const section of ['Occupants','Vehicles','Residential History','References','Emergency Contact']) {
    assert.match(account, new RegExp("addPdfSection\\(doc,'"+section+"'"));
  }
  assert.match(account, /Reference '\+\(i\+1\)\+' Name'/);
  assert.match(account, /Reference '\+\(i\+1\)\+' Phone'/);
  assert.match(account, /Reference '\+\(i\+1\)\+' Relationship'/);
});


test('rental PDF standardizes display casing without mutating stored data', () => {
  const account = fs.readFileSync(new URL('../public/account/index.html', import.meta.url), 'utf8');
  assert.match(account, /const properCase=/);
  assert.match(account, /const yesNoCase=/);
  assert.match(account, /properCase\(personal\.fullName\)/);
  assert.match(account, /properCase\(x\.name\)/);
  assert.match(account, /properCase\(x\.rel\)/);
  assert.match(account, /yesNoCase\(d\.screening\?\.eviction\)/);
});


test('rental PDF universally formats human-readable display text', () => {
  const account = fs.readFileSync(new URL('../public/account/index.html', import.meta.url), 'utf8');
  assert.match(account, /const sentenceCase=/);
  assert.match(account, /const emailCase=/);
  assert.match(account, /const professionalCase=/);
  assert.match(account, /emailCase\(personal\.email\)/);
  assert.match(account, /properCase\(x\.make\)/);
  assert.match(account, /properCase\(x\.model\)/);
  assert.match(account, /properCase\(d\.employment\?\.supervisor\)/);
  assert.match(account, /properCase\(x\.landlord\)/);
  assert.match(account, /sentenceCase\(x\.rent\)/);
  assert.match(account, /sentenceCase\(x\.reason\)/);
});


test('rental PDF uses structured two-column form layout', () => {
  const account = fs.readFileSync(new URL('../public/account/index.html', import.meta.url), 'utf8');
  assert.match(account, /colWidth=\(right-left-gap\)\/2/);
  assert.match(account, /item\.labelText\.toUpperCase\(\)/);
  assert.match(account, /doc\.line\(x,lineY,x\+colWidth,lineY\)/);
  assert.match(account, /String\(title\)\.toUpperCase\(\)/);
});


test('rental PDF includes required payment and authorization disclosures', () => {
  const account = fs.readFileSync(new URL('../public/account/index.html', import.meta.url), 'utf8');
  assert.match(account, /Application Fee & Payment/);
  assert.match(account, /non-refundable Application Fee of \$150\.00/);
  assert.match(account, /Stripe’s standard processing fee of 2\.9% \+ \$0\.30/);
  assert.match(account, /Total Due \$154\.65/);
  assert.match(account, /Authorization, Acknowledgment & Signature/);
  assert.match(account, /Fair Credit Reporting Act \(15 U\.S\.C\. § 1681\)/);
  assert.match(account, /Florida Fair Housing Act \(Fla\. Stat\. § 760\.23\)/);
  assert.match(account, /Applicant Signature/);
});
