import { createHash, randomUUID } from 'node:crypto';

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const TYPES = new Map([
  ['image/png', { extension: 'png', kind: 'image' }],
  ['image/jpeg', { extension: 'jpg', kind: 'image' }],
  ['image/webp', { extension: 'webp', kind: 'image' }],
  ['text/html', { extension: 'html', kind: 'html' }],
]);
function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}
function matchesSignature(bytes, type) {
  if (type === 'image/png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217;
  if (type === 'image/webp') return bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  return true;
}
/**
 * Validate a bounded buffer before passing it to a private storage adapter.
 * HTML remains untrusted and must be delivered from a separate origin with CSP.
 */
export function validateShowcaseMedia({ bytes, contentType, filename }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_MEDIA_BYTES)
    invalid('Invalid media size.');
  if (typeof contentType !== 'string' || !TYPES.has(contentType))
    invalid('Unsupported media type.');
  const definition = TYPES.get(contentType);
  if (typeof filename !== 'string' || filename.length > 160 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._ -]*$/.test(filename) ||
      !filename.toLowerCase().endsWith('.' + definition.extension))
    invalid('Invalid media filename.');
  if (!matchesSignature(bytes, contentType))
    invalid('Media signature does not match its type.');
  if (definition.kind === 'html') {
    const html = bytes.toString('utf8');
    if (html.includes('\uFFFD') || !/<!doctype html\b|<html\b/i.test(html))
      invalid('Invalid HTML document.');
  }
  return {
    kind: definition.kind,
    contentType,
    contentDisposition: 'inline',
    objectKey: 'showcases/' + randomUUID() + '.' + definition.extension,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
  };
}
