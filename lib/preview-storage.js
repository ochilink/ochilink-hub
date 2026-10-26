import { createHmac, randomUUID } from 'node:crypto';

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function token() {
  const value = process.env.PREVIEW_BLOB_READ_WRITE_TOKEN;
  if (!value) fail(503, 'Public preview storage is not configured.');
  return value;
}
function storeIdFromToken(value) {
  const parts = String(value).split('_');
  const id = parts[3] || '';
  if (!id) fail(503, 'Public preview storage configuration is invalid.');
  return id;
}
function decodeDelegation(value) {
  const seg = String(value).split('.')[0];
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
}
function sign(clientSigningToken, operation, pathname, params = {}) {
  const lines = [`operation=${operation}`, `pathname=${pathname}`];
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') lines.push(`${k}=${v}`);
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
async function issueSignedToken({ pathname, validUntil, maximumSizeInBytes }) {
  const rw = token();
  const storeId = storeIdFromToken(rw);
  const body = {
    pathname,
    operations: ['put'],
    validUntil,
    maximumSizeInBytes,
    allowedContentTypes: ['text/html'],
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
  if (!res.ok) fail(503, 'Unable to authorize public preview storage.');
  return { ...(await res.json()), storeId };
}
export async function createPreviewUploadAuthorization(appSlug, originalName, byteSize) {
  const id = randomUUID();
  const cleanSlug = String(appSlug || '').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'');
  if (!cleanSlug) fail(400, 'App slug is required.');
  const pathname = `previews/${cleanSlug}/${id}/index.html`;
  const validUntil = Date.now() + 15 * 60 * 1000;
  const issued = await issueSignedToken({ pathname, validUntil, maximumSizeInBytes: byteSize });
  const scope = decodeDelegation(issued.delegationToken);
  const params = {
    'vercel-blob-allowed-content-types': 'text/html',
    'vercel-blob-maximum-size-in-bytes': byteSize,
    'vercel-blob-add-random-suffix': 'false',
    'vercel-blob-allow-overwrite': 'false',
  };
  if (validUntil < Number(scope.validUntil)) params['vercel-blob-valid-until'] = validUntil;
  const signature = sign(issued.clientSigningToken, 'put', pathname, params);
  const base = new URL('https://vercel.com/api/blob/');
  base.searchParams.set('pathname', pathname);
  return {
    pathname,
    upload_url: withSig(base.toString(), issued.delegationToken, signature, params),
    expected_host: `${issued.storeId}.public.blob.vercel-storage.com`,
    expires_at: validUntil,
    original_name: String(originalName || 'preview.html').slice(0,180),
  };
}
export function validatePreviewBlobUrl(url, pathname) {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch { fail(400, 'Preview storage returned an invalid URL.'); }
  const expectedHost = `${storeIdFromToken(token())}.public.blob.vercel-storage.com`;
  if (parsed.protocol !== 'https:' || parsed.hostname !== expectedHost)
    fail(400, 'Preview storage returned an unexpected host.');
  const expectedPath = '/' + String(pathname || '').split('/').map(encodeURIComponent).join('/');
  if (parsed.pathname !== expectedPath)
    fail(400, 'Preview storage returned an unexpected path.');
  return parsed.toString();
}
