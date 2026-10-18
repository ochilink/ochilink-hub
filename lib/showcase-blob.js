import { validateShowcaseMedia } from './showcase-media.js';

// Require an explicit, store-specific token for Production.
// Never fall back to Preview's default BLOB_READ_WRITE_TOKEN.
export function showcaseBlobOptions(env = process.env) {
  if (env.VERCEL_ENV === 'production') {
    if (!env.PROD_BLOB_STORE_ID || !env.PROD_BLOB_READ_WRITE_TOKEN)
      throw new Error('Production showcase Blob storage is not configured.');
    return { token: env.PROD_BLOB_READ_WRITE_TOKEN, storeId: env.PROD_BLOB_STORE_ID };
  }
  if (env.VERCEL_ENV === 'preview') {
    if (!env.BLOB_READ_WRITE_TOKEN || !env.BLOB_STORE_ID)
      throw new Error('Preview showcase Blob storage is not configured.');
    return { token: env.BLOB_READ_WRITE_TOKEN, storeId: env.BLOB_STORE_ID };
  }
  throw new Error('Showcase Blob storage is unavailable outside Vercel Preview or Production.');
}


// Storage-only adapter. Authorization, request-size enforcement, malware review,
// database writes and audit events belong to the upload route.
export async function storeShowcaseMedia(input, { putBlob, env = process.env } = {}) {
  const validated = validateShowcaseMedia(input);
  if (input.objectKey !== undefined) {
    if (typeof input.objectKey !== 'string' || !/^showcases\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(html|png|jpg|webp)$/.test(input.objectKey) ||
        !input.objectKey.endsWith(validated.objectKey.slice(validated.objectKey.lastIndexOf('.'))))
      throw new TypeError('Invalid reserved showcase object key.');
    validated.objectKey = input.objectKey;
  }
  const storage = showcaseBlobOptions(env);
  const put = putBlob ?? (await import('@vercel/blob')).put;
  const result = await put(validated.objectKey, input.bytes, {
    access: 'private',
    contentType: validated.contentType,
    addRandomSuffix: false,
    allowOverwrite: false,
    ...storage,
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

export async function deleteShowcaseMedia(objectKey, { deleteBlob, env = process.env } = {}) {
  if (typeof objectKey !== 'string' ||
      !/^showcases\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(html|png|jpg|webp)$/.test(objectKey)) {
    throw new TypeError('Invalid showcase object key.');
  }
  const storage = showcaseBlobOptions(env);
  const del = deleteBlob ?? (await import('@vercel/blob')).del;
  await del(objectKey, storage);
}
