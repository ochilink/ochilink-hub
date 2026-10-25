import { randomUUID } from 'node:crypto';
import { createPrivateDownloadUrl, createPrivateHeadUrl, createPrivateUploadUrl } from './blob-storage.js';

const allowedDocumentTypes = new Set(['identity','income','bank_statement','employment','rental_history','other']);
const allowedTypes = new Set([
  'application/pdf',
  'text/markdown',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/zip',
  'video/mp4',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function safeName(value) {
  const raw = String(value || '').trim().slice(0,180);
  if (!raw) fail(400, 'Choose a file.');
  return raw.replace(/[\\/\0\r\n]+/g, '-');
}
async function auditCustomer(pool, customerId, eventType, metadata = {}) {
  await pool.query(
    `INSERT INTO security_auth_logs(event_type,user_identity,metadata)
     VALUES ($1,$2,$3)`,
    [eventType, String(customerId), { customer_id: customerId, ...metadata }],
  );
}
export async function listCustomerDocuments(pool, customerId, filter = 'all', q = '') {
  const where = ["d.customer_id=$1", "d.state='ready'"];
  const params = [customerId];
  if (filter === 'trash') where.push('d.trashed_at IS NOT NULL');
  else {
    where.push('d.trashed_at IS NULL');
    if (filter === 'starred') where.push('d.starred');
    if (filter === 'shared') where.push('d.shared');
    if (filter === 'recent') where.push("d.created_at>=now()-interval '30 days'");
  }
  if (q) {
    params.push('%' + String(q).trim().slice(0,100).toLowerCase() + '%');
    where.push(`lower(d.original_name) LIKE $${params.length}`);
  }
  const [docs, folders, apps, checklists] = await Promise.all([
    pool.query(
      `SELECT d.id,d.application_id,d.folder_id,d.original_name,d.document_type,d.content_type,d.byte_size,
              d.state,d.starred,d.shared,d.uploaded_at,d.trashed_at,d.created_at,
              f.name AS folder_name
       FROM customer_documents d
       LEFT JOIN customer_folders f ON f.id=d.folder_id
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(d.uploaded_at,d.created_at) DESC LIMIT 500`,
      params,
    ),
    pool.query(
      `SELECT f.id,f.name,count(d.id)::int AS file_count
       FROM customer_folders f
       LEFT JOIN customer_documents d ON d.folder_id=f.id AND d.state='ready' AND d.trashed_at IS NULL
       WHERE f.customer_id=$1 GROUP BY f.id,f.name ORDER BY f.name`,
      [customerId],
    ),
    pool.query(
      `SELECT id,property_address,status,payment_status,submitted_at,created_at
       FROM rental_applications WHERE customer_id=$1 ORDER BY created_at DESC`,
      [customerId],
    ),
    pool.query(
      `SELECT application_id,document_type,count(*)::int AS file_count
       FROM customer_documents
       WHERE customer_id=$1 AND application_id IS NOT NULL
         AND state='ready' AND trashed_at IS NULL
       GROUP BY application_id,document_type`,
      [customerId],
    ),
  ]);
  return {
    documents: docs.rows,
    folders: folders.rows,
    applications: apps.rows,
    application_checklists: checklists.rows,
  };
}
export async function createFolder(pool, customerId, name) {
  const clean = String(name || '').trim().slice(0,80);
  if (!clean) fail(400, 'Folder name is required.');
  const folder = (await pool.query(
    `INSERT INTO customer_folders(customer_id,name) VALUES ($1,$2)
     ON CONFLICT(customer_id,name) DO UPDATE SET name=EXCLUDED.name
     RETURNING id,name`,
    [customerId,clean],
  )).rows[0];
  await auditCustomer(pool, customerId, 'CUSTOMER_FOLDER_CREATED', { folder_id: folder.id });
  return folder;
}
export async function beginUpload(pool, customerId, body) {
  const filename = safeName(body.filename);
  const contentType = String(body.content_type || '').trim().toLowerCase();
  const size = Number(body.byte_size);
  const documentType = String(body.document_type || 'other').trim().toLowerCase();
  if (!allowedDocumentTypes.has(documentType)) fail(400, 'Choose a valid document category.');
  if (!allowedTypes.has(contentType)) fail(400, 'This file type is not allowed.');
  if (!Number.isInteger(size) || size <= 0 || size > 500 * 1024 * 1024)
    fail(400, 'File must be between 1 byte and 500 MB.');
  const folderId = body.folder_id || null;
  if (folderId) {
    const ok = (await pool.query(
      'SELECT id FROM customer_folders WHERE id=$1 AND customer_id=$2',
      [folderId,customerId],
    )).rows[0];
    if (!ok) fail(404, 'Folder not found.');
  }
  const applicationId = body.application_id || null;
  if (applicationId) {
    const ok = (await pool.query(
      'SELECT id FROM rental_applications WHERE id=$1 AND customer_id=$2',
      [applicationId,customerId],
    )).rows[0];
    if (!ok) fail(404, 'Application not found.');
  }
  const id = randomUUID();
  const ext = filename.includes('.')
    ? '.' + filename.split('.').pop().toLowerCase().replace(/[^a-z0-9]+/g,'')
    : '';
  const pathname = `customers/${customerId}/documents/${id}${ext}`;

  // Authorize storage before creating metadata so a missing/invalid Blob token
  // cannot leave a misleading pending record behind.
  const signed = await createPrivateUploadUrl({
    pathname,
    contentType,
    maximumSizeInBytes: size,
  });
  await pool.query(
    `INSERT INTO customer_documents
      (id,customer_id,application_id,folder_id,pathname,original_name,document_type,content_type,byte_size)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id,customerId,applicationId,folderId,pathname,filename,documentType,contentType,size],
  );
  await auditCustomer(pool, customerId, 'CUSTOMER_DOCUMENT_UPLOAD_AUTHORIZED', {
    document_id: id,
    application_id: applicationId,
    byte_size: size,
    content_type: contentType,
    document_type: documentType,
  });
  return { document_id: id, pathname, upload_url: signed.url, expires_at: signed.expires_at };
}
export async function completeUpload(pool, customerId, body, fetcher = fetch) {
  const pathname = String(body.pathname || '');
  const pending = (await pool.query(
    `SELECT id,state,pathname,content_type,byte_size,etag
     FROM customer_documents WHERE id=$1 AND customer_id=$2`,
    [body.document_id,customerId],
  )).rows[0];
  if (!pending) fail(404,'Document not found.');
  if (pending.pathname !== pathname) fail(400,'Uploaded path does not match.');
  if (pending.state === 'ready') return { ok: true };
  if (pending.state !== 'pending') fail(409,'Document upload cannot be completed.');

  const head = await createPrivateHeadUrl(pathname);
  const verified = await fetcher(head.url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
  if (!verified.ok) fail(409,'Uploaded file could not be verified.');
  const actualSize = Number(verified.headers.get('content-length'));
  const actualType = String(verified.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!Number.isFinite(actualSize) || actualSize !== Number(pending.byte_size))
    fail(409,'Uploaded file size does not match the authorized upload.');
  if (actualType !== String(pending.content_type).toLowerCase())
    fail(409,'Uploaded file type does not match the authorized upload.');
  const actualEtag = String(verified.headers.get('etag') || body.etag || '').replace(/^W\//,'').slice(0,300) || null;

  const row = (await pool.query(
    `UPDATE customer_documents
     SET state='ready',etag=$1,uploaded_at=now(),updated_at=now()
     WHERE id=$2 AND customer_id=$3 AND state='pending' AND pathname=$4
     RETURNING id,pathname`,
    [actualEtag,body.document_id,customerId,pathname],
  )).rows[0];
  if (!row) fail(409,'Document upload cannot be completed.');
  await auditCustomer(pool, customerId, 'CUSTOMER_DOCUMENT_UPLOADED', {
    document_id: row.id,
    byte_size: actualSize,
    content_type: actualType,
  });
  return { ok: true };
}
export async function documentDownload(pool, customerId, id) {
  const row = (await pool.query(
    `SELECT id,pathname,original_name,content_type FROM customer_documents
     WHERE id=$1 AND customer_id=$2 AND state='ready' AND trashed_at IS NULL`,
    [id,customerId],
  )).rows[0];
  if (!row) fail(404,'Document not found.');
  const signed = await createPrivateDownloadUrl(row.pathname);
  await auditCustomer(pool, customerId, 'CUSTOMER_DOCUMENT_OPENED', { document_id: row.id });
  return { ...signed, name: row.original_name, content_type: row.content_type };
}
export async function updateDocument(pool, customerId, body) {
  const action = String(body.action || '');
  if (!['star','unstar','trash','restore'].includes(action)) fail(400,'Invalid document action.');
  const result = await pool.query(
    `UPDATE customer_documents SET
       starred=CASE WHEN $3='star' THEN true WHEN $3='unstar' THEN false ELSE starred END,
       trashed_at=CASE WHEN $3='trash' THEN now() WHEN $3='restore' THEN NULL ELSE trashed_at END,
       updated_at=now()
     WHERE id=$1 AND customer_id=$2 RETURNING id,starred,trashed_at`,
    [body.id,customerId,action],
  );
  if (!result.rows[0]) fail(404,'Document not found.');
  await auditCustomer(pool, customerId, 'CUSTOMER_DOCUMENT_UPDATED', {
    document_id: body.id,
    action,
  });
  return result.rows[0];
}
