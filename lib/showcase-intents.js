import { randomUUID } from 'node:crypto';
import { validateShowcaseMedia } from './showcase-media.js';

// Persist an intent BEFORE uploading. The storage adapter must use this exact key.
export async function createShowcaseIntent(pool, { appId, actorId, objectKey }) {
  const { rows } = await pool.query(
    `INSERT INTO showcase_upload_intents(intent_id,app_id,actor_id,object_key,state)
     VALUES ($1,$2,$3,$4,'pending') RETURNING intent_id`,
    [randomUUID(), appId, actorId, objectKey],
  );
  if (!rows[0]?.intent_id) throw new Error('Upload intent could not be recorded.');
  return rows[0].intent_id;
}

export async function setShowcaseIntentState(pool, intentId, state, errorCode = null) {
  if (!['committed', 'cleanup_required', 'cleaned'].includes(state))
    throw new TypeError('Invalid upload intent state.');
  const { rowCount } = await pool.query(
    `UPDATE showcase_upload_intents
       SET state=$2,last_error_code=$3,updated_at=now()
     WHERE intent_id=$1 AND state IN ('pending','cleanup_required')`,
    [intentId, state, errorCode],
  );
  if (rowCount !== 1) throw new Error('Upload intent state update failed.');
}

// Only reconcile an intent after checking that the object is NOT the current
// published preview. Never remove a referenced object.
export async function reconcileShowcaseIntent(pool, intent, remove) {
  if (!['pending', 'cleanup_required'].includes(intent.state))
    return { skipped: true };
  const { rows } = await pool.query(
    'SELECT 1 FROM apps WHERE preview_object_key=$1 LIMIT 1',
    [intent.object_key],
  );
  if (rows.length) return { skipped: true, reason: 'referenced' };
  await remove(intent.object_key);
  await setShowcaseIntentState(pool, intent.intent_id, 'cleaned');
  return { cleaned: true };
}
