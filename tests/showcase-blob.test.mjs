import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  storeShowcaseMedia,
  deleteShowcaseMedia,
  showcaseDeliveryHeaders,
} from '../lib/showcase-blob.js';


const previewEnv = {
  VERCEL_ENV: 'preview',
  BLOB_STORE_ID: 'preview-test-store',
  BLOB_READ_WRITE_TOKEN: 'mock-preview-token',
};

const html = Buffer.from('<!doctype html><html><body>Preview</body></html>');
const input = { bytes: html, contentType: 'text/html', filename: 'preview.html' };


test('blob adapter requests private storage and preserves validated metadata', async () => {
  let calls = 0;
 
const stored = await storeShowcaseMedia(input, {
  env: previewEnv,
  putBlob: async (key, bytes, options) => {

      calls++;
      assert.match(key, /^showcases\/[a-f0-9-]+\.html$/);
      assert.equal(bytes, html);
     
assert.deepEqual(options, {
  access: 'private',
  contentType: 'text/html',
  addRandomSuffix: false,
  allowOverwrite: false,
  token: 'mock-preview-token',
  storeId: 'preview-test-store',
});

      return { pathname: key, url: 'https://example.invalid/private-object' };
    },
  });
  assert.equal(calls, 1);
  assert.equal(stored.kind, 'html');
  assert.equal(stored.contentType, 'text/html');
  assert.equal(stored.byteLength, html.length);
  assert.match(stored.sha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(stored, 'url'), false);
});

test('blob adapter rejects invalid uploads before contacting storage', async () => {
  let called = false;
  await assert.rejects(
    storeShowcaseMedia({ bytes: Buffer.from('bad'), contentType: 'image/png', filename: 'bad.png' }, {
      putBlob: async () => { called = true; },
    }),
    /signature/i,
  );
  assert.equal(called, false);
});


test('blob adapter propagates storage failures and rejects mismatched object keys', async () => {
  await assert.rejects(
    storeShowcaseMedia(input, {
      env: previewEnv,
      putBlob: async () => {
        throw new Error('storage unavailable');
      },
    }),
    /storage unavailable/,
  );

  await assert.rejects(
    storeShowcaseMedia(input, {
      env: previewEnv,
      putBlob: async () => ({
        pathname: 'wrong.html',
        url: 'https://example.invalid',
      }),
    }),
    /invalid/i,
  );
});




test('blob adapter creates distinct keys for identical files', async () => {
  const putBlob = async (key) => ({
    pathname: key,
    url: 'https://example.invalid/private',
  });

  const first = await storeShowcaseMedia(input, {
    env: previewEnv,
    putBlob,
  });

  const second = await storeShowcaseMedia(input, {
    env: previewEnv,
    putBlob,
  });

  assert.notEqual(first.objectKey, second.objectKey);
  assert.equal(first.sha256, second.sha256);
});

test('preview delivery headers prevent sniffing and restrict HTML capabilities', () => {
  const htmlHeaders = showcaseDeliveryHeaders('html');
  assert.equal(htmlHeaders['Content-Disposition'], 'inline');
  assert.equal(htmlHeaders['X-Content-Type-Options'], 'nosniff');
  assert.match(htmlHeaders['Content-Security-Policy'], /connect-src 'none'/);
  assert.match(htmlHeaders['Content-Security-Policy'], /form-action 'none'/);
  assert.equal(showcaseDeliveryHeaders('image')['Content-Disposition'], 'inline');
  assert.equal(Object.hasOwn(showcaseDeliveryHeaders('image'), 'Content-Security-Policy'), false);
  assert.throws(() => showcaseDeliveryHeaders('svg'), TypeError);
});

test('Production never falls back to Preview Blob credentials', async () => {
  let called = false;

  const env = {
    VERCEL_ENV: 'production',
    PROD_BLOB_STORE_ID: 'production-test-store',
    BLOB_READ_WRITE_TOKEN: 'preview-test-token',
  };

  await assert.rejects(
    storeShowcaseMedia(input, {
      env,
      putBlob: async () => {
        called = true;
      },
    }),
    /not configured/i,
  );

  assert.equal(called, false);
});


test('Production upload selects dedicated Blob storage', async () => {
  const env = {
    VERCEL_ENV: 'production',
    PROD_BLOB_STORE_ID: 'production-test-store',
    PROD_BLOB_READ_WRITE_TOKEN: 'mock-production-token',
    BLOB_READ_WRITE_TOKEN: 'mock-preview-token',
  };

  let capturedOptions;

  await storeShowcaseMedia(input, {
    env,
    putBlob: async (key, bytes, options) => {
      capturedOptions = options;

      return {
        pathname: key,
        url: 'https://example.invalid/production-object',
      };
    },
  });

  assert.equal(capturedOptions.token, 'mock-production-token');
  assert.equal(capturedOptions.storeId, 'production-test-store');
  assert.notEqual(capturedOptions.token, env.BLOB_READ_WRITE_TOKEN);
});


test('Production deletion uses dedicated Blob storage', async () => {
  const env = {
    VERCEL_ENV: 'production',
    PROD_BLOB_STORE_ID: 'production-test-store',
    PROD_BLOB_READ_WRITE_TOKEN: 'mock-production-token',
    BLOB_READ_WRITE_TOKEN: 'mock-preview-token',
  };

  let capturedOptions;

  await deleteShowcaseMedia(
    'showcases/11111111-1111-4111-8111-111111111111.html',
    {
      env,
      deleteBlob: async (key, options) => {
        capturedOptions = options;
      },
    },
  );

  assert.deepEqual(capturedOptions, {
    token: 'mock-production-token',
    storeId: 'production-test-store',
  });
});
