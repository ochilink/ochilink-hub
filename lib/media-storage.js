import { createHmac, randomUUID } from 'node:crypto';

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function token() {
  const dedicated = process.env.MEDIA_BLOB_READ_WRITE_TOKEN;
  if (dedicated) return dedicated;
  // Preview validation may reuse the existing public preview Blob store.
  // Production must use its own dedicated media store/token.
  if (process.env.VERCEL_ENV !== 'production' && process.env.PREVIEW_BLOB_READ_WRITE_TOKEN)
    return process.env.PREVIEW_BLOB_READ_WRITE_TOKEN;
  fail(503, 'Public media storage is not configured.');
}
function storeIdFromToken(value) {
  const parts = String(value).split('_');
  const id = parts[3] || '';
  if (!id) fail(503, 'Public media storage configuration is invalid.');
  return id;
}
function decodeDelegation(value) {
  const seg = String(value).split('.')[0];
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
}
function sign(clientSigningToken, operation, pathname, params = {}) {
  const lines = [`operation=${operation}`, `pathname=${pathname}`];
  for (const [k,v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') lines.push(`${k}=${v}`);
  }
  lines.sort((a,b)=>Buffer.from(a).compare(Buffer.from(b)));
  return createHmac('sha256', clientSigningToken).update(lines.join('\n')).digest('base64url');
}
function withSig(url, delegationToken, signature, params = {}) {
  const out = new URL(url);
  for (const [k,v] of Object.entries(params)) out.searchParams.set(k, String(v));
  out.searchParams.set('vercel-blob-delegation', delegationToken);
  out.searchParams.set('vercel-blob-signature', signature);
  return out.toString();
}
async function issueSignedToken({ pathname, validUntil, maximumSizeInBytes, contentType }) {
  const rw = token();
  const storeId = storeIdFromToken(rw);
  const body = {
    pathname,
    operations: ['put'],
    validUntil,
    maximumSizeInBytes,
    allowedContentTypes: [contentType],
  };
  const res = await fetch('https://vercel.com/api/blob/signed-token', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${rw}`,
      'Content-Type': 'application/json',
      'x-api-version': '13',
      'x-vercel-blob-store-id': storeId,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) fail(503, 'Unable to authorize public media storage.');
  return { ...(await res.json()), storeId };
}
function cleanName(value) {
  return String(value || '')
    .trim()
    .slice(0, 180)
    .replace(/[\\/\0\r\n]+/g, '-');
}
function extForType(contentType) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  fail(400, 'Use a JPG, PNG, or WebP image.');
}
export async function createMediaUploadAuthorization({ appSlug, filename, byteSize, contentType }) {
  if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > 12 * 1024 * 1024)
    fail(400, 'Image must be between 1 byte and 12 MB.');
  const ext = extForType(contentType);
  const cleanSlug = String(appSlug || 'library')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g,'-')
    .replace(/^-|-$/g,'') || 'library';
  const id = randomUUID();
  const pathname = `media/${cleanSlug}/${id}.${ext}`;
  const validUntil = Date.now() + 15 * 60 * 1000;
  const issued = await issueSignedToken({
    pathname,
    validUntil,
    maximumSizeInBytes: byteSize,
    contentType,
  });
  const scope = decodeDelegation(issued.delegationToken);
  const params = {
    'vercel-blob-allowed-content-types': contentType,
    'vercel-blob-maximum-size-in-bytes': byteSize,
    'vercel-blob-add-random-suffix': 'false',
    'vercel-blob-allow-overwrite': 'false',
  };
  if (validUntil < Number(scope.validUntil))
    params['vercel-blob-valid-until'] = validUntil;
  const signature = sign(issued.clientSigningToken, 'put', pathname, params);
  const base = new URL('https://vercel.com/api/blob/');
  base.searchParams.set('pathname', pathname);
  return {
    pathname,
    upload_url: withSig(base.toString(), issued.delegationToken, signature, params),
    expected_host: `${issued.storeId}.public.blob.vercel-storage.com`,
    expires_at: validUntil,
    original_name: cleanName(filename) || `image.${ext}`,
  };
}
export function validateMediaBlobUrl(url, pathname) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    fail(400, 'Media storage returned an invalid URL.');
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname.endsWith('.public.blob.vercel-storage.com')
  )
    fail(400, 'Media storage returned an unexpected host.');
  const expectedPath = '/' + String(pathname || '').split('/').map(encodeURIComponent).join('/');
  if (parsed.pathname !== expectedPath)
    fail(400, 'Media storage returned an unexpected path.');
  return parsed.toString();
}
