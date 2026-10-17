import { createHash } from 'node:crypto';
import { getPool } from './_db.js';
import { storeShowcaseMedia, deleteShowcaseMedia } from '../lib/showcase-blob.js';
import { MAX_MEDIA_BYTES, validateShowcaseMedia } from '../lib/showcase-media.js';

const LIMIT = MAX_MEDIA_BYTES;
const deny = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function boundedBody(req) {
  const chunks = [];
  let total = 0;
  for await (const part of req) {
    total += part.length;
    if (total > LIMIT) deny(413, 'Upload exceeds 5 MB.');
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}
export function createShowcaseUploadHandler({ poolProvider = getPool, store = storeShowcaseMedia, remove = deleteShowcaseMedia } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method !== 'POST') deny(405, 'Method not allowed.');
      if (!req.headers?.host || req.headers.origin !== 'https://' + req.headers.host)
        deny(403, 'Invalid request origin.');
      const token = String(req.headers.cookie || '').match(/(?:^|;\s*)ochi_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (!token) deny(401, 'Authentication required.');
      const pool = poolProvider();
      const { rows: users } = await pool.query(
        `SELECT u.id FROM hub_sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active AND u.role='admin'`,
        [createHash('sha256').update(token).digest('hex')],
      );
      if (!users.length) deny(403, 'Administrator access required.');
      const appId = String(req.query?.app_id || '');
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(appId))
        deny(400, 'Invalid application ID.');
      const length = Number(req.headers['content-length']);
      if (Number.isFinite(length) && length > LIMIT) deny(413, 'Upload exceeds 5 MB.');
      const filename = String(req.headers['x-media-filename'] || '');
      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const bytes = await boundedBody(req);
      validateShowcaseMedia({ bytes, filename, contentType });
      const { rows: apps } = await pool.query('SELECT id FROM apps WHERE id=$1', [appId]);
      if (!apps.length) deny(404, 'Application not found.');
      const uploaded = await store({ bytes, filename, contentType });
      // The object is private and cannot be published without committed metadata.
      // A failed transaction can leave an orphan; cleanup reconciliation is required
      // before enabling this endpoint in a deployed environment.
      let client;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query(
          `UPDATE apps SET preview_object_key=$2,preview_kind=$3,
           preview_file_url=NULL,preview_updated_at=now(),updated_at=now() WHERE id=$1`,
          [appId, uploaded.objectKey, uploaded.kind],
        );
        await client.query(
          `INSERT INTO security_auth_logs(actor_id,event_type,metadata)
           VALUES ($1,'SHOWCASE_MEDIA_UPLOADED',$2)`,
          [users[0].id, JSON.stringify({
            app_id: appId, object_key: uploaded.objectKey,
            kind: uploaded.kind, size: uploaded.byteLength, sha256: uploaded.sha256,
          })],
        );
        await client.query('COMMIT');
      } catch (error) {
        if (client) {
          try { await client.query('ROLLBACK'); } catch { /* original failure takes priority */ }
        }
        try { await remove(uploaded.objectKey); }
        catch (cleanupError) {
          console.error('Showcase orphan cleanup failed', {
            code: 'SHOWCASE_ORPHAN_CLEANUP_FAILED',
            objectKey: uploaded.objectKey,
            error: String(cleanupError?.code || cleanupError?.name || 'UNKNOWN'),
          });
        }
        throw error;
      } finally { client?.release(); }
      return res.status(201).json({ ok: true, kind: uploaded.kind });
    } catch (error) {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
      return res.status(status).json({ error: status === 500 ? 'Media upload unavailable.' : error.message });
    }
  };
}
export default createShowcaseUploadHandler();
