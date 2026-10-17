import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeShowcaseMedia, showcaseDeliveryHeaders } from '../lib/showcase-blob.js';

const html = Buffer.from('<!doctype html><html><body>Preview</body></html>');
const input = { bytes: html, contentType: 'text/html', filename: 'preview.html' };

test('blob adapter requests private storage and preserves validated metadata', async () => {
  let calls = 0;
  const stored = await storeShowcaseMedia(input, {
    putBlob: async (key, bytes, options) => {
      calls++;
      assert.match(key, /^showcases\/[a-f0-9-]+\.html$/);
      assert.equal(bytes, html);
      assert.deepEqual(options, {
        access: 'private',
        contentType: 'text/html',
        addRandomSuffix: false,
        allowOverwrite: false,
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
    storeShowcaseMedia(input, { putBlob: async () => { throw new Error('storage unavailable'); } }),
    /storage unavailable/,
  );
  await assert.rejects(
    storeShowcaseMedia(input, { putBlob: async () => ({ pathname: 'wrong.html', url: 'https://example.invalid' }) }),
    /invalid/i,
  );
});

test('blob adapter creates distinct keys for identical files', async () => {
  const putBlob = async (key) => ({ pathname: key, url: 'https://example.invalid/private' });
  const first = await storeShowcaseMedia(input, { putBlob });
  const second = await storeShowcaseMedia(input, { putBlob });
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
