import { createHash } from 'node:crypto';
import { getPool } from './_db.js';
import { storeShowcaseMedia, deleteShowcaseMedia } from '../lib/showcase-blob.js';
import { MAX_MEDIA_BYTES, validateShowcaseMedia } from '../lib/showcase-media.js';
import { createShowcaseIntent, setShowcaseIntentState } from '../lib/showcase-intents.js';

const LIMIT = MAX_MEDIA_BYTES;
// Fail closed outside Preview unless Production is explicitly enabled.
// An explicit false disables Preview as well.
export function isShowcaseMediaEnabled(env = process.env) {
  if (env.VERCEL_ENV === 'preview') return env.SHOWCASE_MEDIA_ENABLED !== 'false';
  if (env.VERCEL_ENV === 'production') return env.SHOWCASE_MEDIA_ENABLED === 'true';
  return false;
}
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
    let stage = 'request_validation';
    try {
      if (!isShowcaseMediaEnabled(process.env)) deny(404, 'Not found.');
      if (req.method !== 'POST') deny(405, 'Method not allowed.');
      if (!req.headers?.host || req.headers.origin !== 'https://' + req.headers.host)
        deny(403, 'Invalid request origin.');
      const token = String(req.headers.cookie || '').match(/(?:^|;\s*)ochi_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (!token) deny(401, 'Authentication required.');
      stage = 'database_auth';
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
      stage = 'file_validation';
      const bytes = await boundedBody(req);
      const validated = validateShowcaseMedia({ bytes, filename, contentType });
      stage = 'application_lookup';
      const { rows: apps } = await pool.query('SELECT id FROM apps WHERE id=$1', [appId]);
      if (!apps.length) deny(404, 'Application not found.');
      stage = 'intent_creation';
      const intentId = await createShowcaseIntent(pool, {
        appId, actorId: users[0].id, objectKey: validated.objectKey,
      });
      let uploaded;
      try {
        stage = 'blob_storage';
        uploaded = await store({ bytes, filename, contentType, objectKey: validated.objectKey });
        if (uploaded.objectKey !== validated.objectKey) throw new Error('Uploaded object key mismatch.');
      } catch (error) {
        await setShowcaseIntentState(pool, intentId, 'cleanup_required', 'STORE_FAILED');
        throw error;
      }
      // The object is private and cannot be published without committed metadata.
      // A failed transaction can leave an orphan; cleanup reconciliation is required
      // before enabling this endpoint in a deployed environment.
      let client;
      try {
        stage = 'metadata_commit';
        client = await pool.connect();
        await client.query('BEGIN');
        // Coordinate publication with orphan recovery using the same transaction lock.
        await client.query('SELECT pg_advisory_xact_lock(73419, 11)');
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
        const intentUpdate = await client.query(
          `UPDATE showcase_upload_intents SET state='committed',updated_at=now()
           WHERE intent_id=$1 AND state='pending'`, [intentId],
        );
        if (intentUpdate.rowCount !== 1) throw new Error('Upload intent is no longer pending.');
        await client.query('COMMIT');
      } catch (error) {
        if (client) {
          try { await client.query('ROLLBACK'); } catch { /* original failure takes priority */ }
        }
        try {
          await setShowcaseIntentState(pool, intentId, 'cleanup_required', 'DB_FAILED');
          await remove(uploaded.objectKey);
          await setShowcaseIntentState(pool, intentId, 'cleaned');
        }
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
      if (status === 500) {
        // Emit only fixed stage labels and generic error categories; never log secrets,
        // SQL statements, connection strings, filenames, object keys or raw exceptions.
        console.error('Showcase upload failed', {
          code: 'SHOWCASE_UPLOAD_FAILED',
          stage,
          category: error instanceof TypeError ? 'TypeError' : 'InternalError',
          // PostgreSQL SQLSTATE is exactly five alphanumeric characters.
          // Log constraint identifiers only from the known migration schema.
          db_code: typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code)
            ? error.code : null,
          constraint: [
            'showcase_upload_intents_actor_id_fkey',
            'showcase_upload_intents_app_id_fkey',
            'showcase_upload_intents_object_key_check',
            'showcase_upload_intents_object_key_key',
            'showcase_upload_intents_state_check',
            'showcase_upload_intents_pkey',
          ].includes(error?.constraint) ? error.constraint : null,
          schema: error?.schema === 'public' ? 'public' : null,
          table: [
            'showcase_upload_intents',
            'apps',
            'users',
            'hub_sessions',
            'security_auth_logs',
          ].includes(error?.table) ? error.table : null,
          // Report only known PostgreSQL privilege-check routines.
          routine: [
            'aclcheck_error',
            'aclcheck_error_col',
            'object_aclcheck',
          ].includes(error?.routine) ? error.routine : null,
        });
      }
      return res.status(status).json({ error: status === 500 ? 'Media upload unavailable.' : error.message });
    }
  };
}
export default createShowcaseUploadHandler();
