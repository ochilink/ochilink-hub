import { validateShowcaseMedia } from './showcase-media.js';

// Storage-only adapter. Authorization, request-size enforcement, malware review,
// database writes and audit events belong to the upload route.
export async function storeShowcaseMedia(input, { putBlob } = {}) {
  const validated = validateShowcaseMedia(input);
  const put = putBlob ?? (await import('@vercel/blob')).put;
  const result = await put(validated.objectKey, input.bytes, {
    access: 'private',
    contentType: validated.contentType,
    addRandomSuffix: false,
    allowOverwrite: false,
  });
  if (!result || typeof result.pathname !== 'string' ||
      result.pathname !== validated.objectKey ||
      typeof result.url !== 'string') {
    throw new Error('Blob upload response was invalid.');
  }
  // Private blob URLs are not browser-viewable. Never expose tokens.
  return {
    objectKey: result.pathname,
    kind: validated.kind,
    contentType: validated.contentType,
    byteLength: validated.byteLength,
    sha256: validated.sha256,
  };
}

// Delivery headers must be set by the authenticated, isolated preview route.
// Inline is a response header, not a supported put() option.
export function showcaseDeliveryHeaders(kind) {
  if (kind !== 'html' && kind !== 'image') throw new TypeError('Invalid preview kind');
  return {
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    ...(kind === 'html' ? {
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
    } : {}),
  };
}
