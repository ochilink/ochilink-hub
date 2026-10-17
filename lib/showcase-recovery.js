import { deleteShowcaseMedia } from './showcase-blob.js';

// Run only after migration 007 is installed. No cron wiring until reviewed.
// A transaction row lock prevents two workers from processing one intent.
// The global advisory lock is reserved for all media publication and cleanup
// operations; upload publication must acquire it before this worker is enabled.
export async function recoverShowcaseUploads(pool, {
  remove = deleteShowcaseMedia,
  limit = 5,
  dryRun = true,
} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new TypeError('Invalid recovery batch size.');
  const client = await pool.connect();
  const result = { candidates: 0, referenced: 0, cleaned: 0, failures: 0, dryRun };
  try {
    await client.query('BEGIN');
    // Fail closed if another media publisher/worker owns the shared lock.
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(73419, 11) AS acquired');
    if (!lock.rows[0]?.acquired) {
      await client.query('ROLLBACK');
      return { ...result, locked: true };
    }
    const { rows } = await client.query(
      `SELECT intent_id, object_key, state
       FROM showcase_upload_intents
       WHERE state IN ('pending','cleanup_required')
         AND updated_at < now() - interval '1 hour'
       ORDER BY updated_at, intent_id
       LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    result.candidates = rows.length;
    for (const intent of rows) {
      const ref = await client.query(
        'SELECT 1 FROM apps WHERE preview_object_key=$1 LIMIT 1',
        [intent.object_key],
      );
      if (ref.rows.length) {
        result.referenced++;
        continue;
      }
      if (dryRun) continue;
      try {
        await remove(intent.object_key);
      } catch {
        result.failures++;
        await client.query(
          `UPDATE showcase_upload_intents SET state='cleanup_required',
           last_error_code='DELETE_FAILED',updated_at=now()
           WHERE intent_id=$1`,
          [intent.intent_id],
        );
        continue;
      }
      await client.query(
        `UPDATE showcase_upload_intents SET state='cleaned',
         last_error_code=NULL,updated_at=now() WHERE intent_id=$1`,
        [intent.intent_id],
      );
      result.cleaned++;
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
