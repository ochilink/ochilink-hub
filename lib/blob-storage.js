import { createHmac } from 'node:crypto';

function rwToken() {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw Object.assign(new Error('Private document storage is not configured.'), { status: 503 });
    return token;
}
function storeIdFromToken(token) {
    const parts = token.split('_');
    const id = parts[3] || '';
    if (!id) throw Object.assign(new Error('Private document storage configuration is invalid.'), { status: 503 });
    return id;
}
function b64url(buf) {
    return Buffer.from(buf).toString('base64url');
}
async function issueSignedToken({ pathname, operations, validUntil, maximumSizeInBytes, allowedContentTypes }) {
    const token = rwToken();
    const storeId = storeIdFromToken(token);
    const body = {
        pathname,
        operations,
        validUntil,
        ...(maximumSizeInBytes ? { maximumSizeInBytes } : {}),
        ...(allowedContentTypes?.length ? { allowedContentTypes } : {}),
    };
    const res = await fetch('https://vercel.com/api/blob/signed-token', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-api-version': '13',
            'x-vercel-blob-store-id': storeId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw Object.assign(new Error('Unable to authorize document storage.'), { status: 503 });
    return { ...(await res.json()), storeId };
}
function decodeDelegation(token) {
    const seg = String(token).split('.')[0];
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
export async function createPrivateUploadUrl({ pathname, contentType, maximumSizeInBytes }) {
    const validUntil = Date.now() + 15 * 60 * 1000;
    const issued = await issueSignedToken({
        pathname,
        operations: ['put'],
        validUntil,
        maximumSizeInBytes,
        allowedContentTypes: [contentType],
    });
    const scope = decodeDelegation(issued.delegationToken);
    const params = {};
    if (validUntil < Number(scope.validUntil)) params['vercel-blob-valid-until'] = validUntil;
    params['vercel-blob-allowed-content-types'] = contentType;
    params['vercel-blob-maximum-size-in-bytes'] = maximumSizeInBytes;
    params['vercel-blob-add-random-suffix'] = 'false';
    params['vercel-blob-allow-overwrite'] = 'false';
    const signature = sign(issued.clientSigningToken, 'put', pathname, params);
    const base = new URL('https://vercel.com/api/blob/');
    base.searchParams.set('pathname', pathname);
    return {
        url: withSig(base.toString(), issued.delegationToken, signature, params),
        expires_at: validUntil,
    };
}
export async function createPrivateDownloadUrl(pathname) {
    const validUntil = Date.now() + 5 * 60 * 1000;
    const issued = await issueSignedToken({ pathname, operations: ['get'], validUntil });
    const scope = decodeDelegation(issued.delegationToken);
    const params = {};
    if (validUntil < Number(scope.validUntil)) params['vercel-blob-valid-until'] = validUntil;
    const signature = sign(issued.clientSigningToken, 'get', pathname, params);
    const blobUrl = `https://${issued.storeId}.private.blob.vercel-storage.com/${pathname.split('/').map(encodeURIComponent).join('/')}`;
    return { url: withSig(blobUrl, issued.delegationToken, signature, params), expires_at: validUntil };
}
