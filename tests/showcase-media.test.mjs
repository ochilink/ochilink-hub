import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateShowcaseMedia, MAX_MEDIA_BYTES } from '../lib/showcase-media.js';

const validHtml = Buffer.from('<!doctype html><html><body><h1>Demo</h1></body></html>');
const png = Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  Buffer.from('sample-image-data'),
]);
const jpeg = Buffer.from([255,216,255,224,1,2,255,217]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('VP8 ')]);
const validate = (bytes, contentType, filename) =>
  validateShowcaseMedia({ bytes, contentType, filename });

test('showcase media accepts valid HTML and prepares inline delivery metadata', () => {
  const result = validate(validHtml, 'text/html', 'demo.html');
  assert.equal(result.kind, 'html');
  assert.equal(result.contentType, 'text/html');
  assert.equal(result.contentDisposition, 'inline');
  assert.match(result.objectKey, /^showcases\/[a-f0-9-]+\.html$/);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.byteLength, validHtml.length);
});

test('showcase media accepts permitted image signatures', () => {
  for (const [bytes, type, name, ext] of [
    [png, 'image/png', 'demo.png', 'png'],
    [jpeg, 'image/jpeg', 'demo.jpg', 'jpg'],
    [webp, 'image/webp', 'demo.webp', 'webp'],
  ]) {
    const result = validate(bytes, type, name);
    assert.equal(result.kind, 'image');
    assert.equal(result.contentType, type);
    assert.ok(result.objectKey.endsWith('.' + ext));
  }
});

test('showcase media rejects invalid signatures and unsupported formats', () => {
  assert.throws(() => validate(Buffer.from('not a png'), 'image/png', 'bad.png'), /signature/i);
  assert.throws(() => validate(Buffer.from('not a jpeg'), 'image/jpeg', 'bad.jpg'), /signature/i);
  assert.throws(() => validate(Buffer.from('not a webp'), 'image/webp', 'bad.webp'), /signature/i);
  assert.throws(() => validate(validHtml, 'application/javascript', 'demo.js'), /unsupported/i);
  assert.throws(() => validate(Buffer.from('plain text'), 'text/html', 'demo.html'), /html/i);
});

test('showcase media enforces size and filename restrictions', () => {
  assert.throws(() => validate(Buffer.alloc(0), 'image/png', 'empty.png'), /size/i);
  assert.throws(() => validate(Buffer.alloc(MAX_MEDIA_BYTES + 1), 'image/png', 'large.png'), /size/i);
  assert.throws(() => validate(validHtml, 'text/html', '../demo.html'), /filename/i);
  assert.throws(() => validate(validHtml, 'text/html', 'demo.svg'), /filename/i);
  assert.throws(() => validate(validHtml, 'text/html', 'bad\\name.html'), /filename/i);
});

test('showcase media generates unique object keys for identical uploads', () => {
  const first = validate(validHtml, 'text/html', 'demo.html');
  const second = validate(validHtml, 'text/html', 'demo.html');
  assert.notEqual(first.objectKey, second.objectKey);
  assert.equal(first.sha256, second.sha256);
});
