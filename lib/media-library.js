import { createMediaUploadAuthorization, validateMediaBlobUrl } from './media-storage.js';

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function text(value, max, required = false) {
  const out = String(value ?? '').trim();
  if (out.length > max || (required && !out)) fail(400, 'Please check the media fields.');
  return out;
}
async function appForAdmin(pool, appId) {
  if (!appId) return null;
  const row = (await pool.query(
    'SELECT id,slug,name,status FROM apps WHERE id=$1',
    [appId],
  )).rows[0];
  if (!row) fail(404, 'App not found.');
  return row;
}
export async function listMediaAssets(pool, appId = null) {
  const params = [];
  let where = "WHERE m.state <> 'archived'";
  if (appId) {
    params.push(appId);
    where += ' AND m.app_id=$1';
  }
  const media = (await pool.query(
    `SELECT m.id,m.app_id,m.kind,m.pathname,m.public_url,m.original_name,m.content_type,
            m.byte_size,m.width,m.height,m.alt_text,m.label,m.state,m.created_at,m.updated_at,
            a.name AS app_name,a.slug AS app_slug
       FROM media_assets m
       LEFT JOIN apps a ON a.id=m.app_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT 500`,
    params,
  )).rows;
  const apps = (await pool.query(
    'SELECT id,slug,name,status,cover_image_url FROM apps ORDER BY sort_order,name',
  )).rows;
  return { apps, media };
}
export async function beginMediaUpload(pool, actorId, body) {
  const app = await appForAdmin(pool, body.app_id || null);
  const filename = text(body.filename, 180, true);
  const contentType = text(body.content_type, 80, true);
  const byteSize = Number(body.byte_size);
  const auth = await createMediaUploadAuthorization({
    appSlug: app?.slug || 'library',
    filename,
    byteSize,
    contentType,
  });
  const row = (await pool.query(
    `INSERT INTO media_assets
      (app_id,kind,pathname,public_url,original_name,content_type,byte_size,state,uploaded_by)
      VALUES ($1,'image',$2,'pending://media',$3,$4,$5,'pending',$6)
      RETURNING id,pathname`,
    [app?.id || null, auth.pathname, auth.original_name, contentType, byteSize, actorId],
  )).rows[0];
  await pool.query(
    "INSERT INTO security_auth_logs(actor_id,event_type,metadata) VALUES ($1,'MEDIA_UPLOAD_AUTHORIZED',$2)",
    [actorId, { media_id: row.id, app_id: app?.id || null, byte_size: byteSize, content_type: contentType }],
  );
  return {
    media_id: row.id,
    pathname: row.pathname,
    upload_url: auth.upload_url,
    expected_host: auth.expected_host,
    expires_at: auth.expires_at,
  };
}
export async function completeMediaUpload(client, actorId, body) {
  const row = (await client.query(
    'SELECT * FROM media_assets WHERE id=$1 FOR UPDATE',
    [body.media_id],
  )).rows[0];
  if (!row) fail(404, 'Media upload not found.');
  if (row.state === 'ready') return row;
  if (row.state !== 'pending') fail(409, 'Media upload cannot be completed.');
  if (String(body.pathname || '') !== row.pathname) fail(400, 'Media path does not match.');
  const publicUrl = validateMediaBlobUrl(body.public_url, row.pathname);
  const width = body.width == null ? null : Number(body.width);
  const height = body.height == null ? null : Number(body.height);
  if (width !== null && (!Number.isInteger(width) || width <= 0 || width > 20000))
    fail(400, 'Invalid image width.');
  if (height !== null && (!Number.isInteger(height) || height <= 0 || height > 20000))
    fail(400, 'Invalid image height.');
  const ready = (await client.query(
    `UPDATE media_assets
     SET public_url=$1,width=$2,height=$3,alt_text=$4,label=$5,state='ready',updated_at=now()
     WHERE id=$6 RETURNING *`,
    [
      publicUrl,
      width,
      height,
      text(body.alt_text, 300),
      text(body.label, 160),
      row.id,
    ],
  )).rows[0];
  await client.query(
    "INSERT INTO security_auth_logs(actor_id,event_type,metadata) VALUES ($1,'MEDIA_UPLOAD_COMPLETED',$2)",
    [actorId, { media_id: row.id, app_id: row.app_id, width, height }],
  );
  return ready;
}
export async function updateMediaAsset(client, actorId, body) {
  const id = text(body.id, 80, true);
  const app = await appForAdmin(client, body.app_id || null);
  const result = await client.query(
    `UPDATE media_assets
     SET app_id=$1,alt_text=$2,label=$3,updated_at=now()
     WHERE id=$4 AND state='ready'
     RETURNING *`,
    [app?.id || null, text(body.alt_text, 300), text(body.label, 160), id],
  );
  if (!result.rowCount) fail(404, 'Media asset not found.');
  await client.query(
    "INSERT INTO security_auth_logs(actor_id,event_type,metadata) VALUES ($1,'MEDIA_UPDATED',$2)",
    [actorId, { media_id: id, app_id: app?.id || null }],
  );
  return result.rows[0];
}
export async function assignMediaAsAppCover(client, actorId, body) {
  const mediaId = text(body.media_id, 80, true);
  const appId = text(body.app_id, 80, true);
  const media = (await client.query(
    "SELECT id,public_url,app_id FROM media_assets WHERE id=$1 AND state='ready' FOR UPDATE",
    [mediaId],
  )).rows[0];
  if (!media) fail(404, 'Media asset not found.');
  const app = await appForAdmin(client, appId);
  await client.query(
    'UPDATE apps SET cover_image_url=$1,cover_preview_image=NULL,updated_at=now() WHERE id=$2',
    [media.public_url, app.id],
  );
  if (media.app_id !== app.id) {
    await client.query('UPDATE media_assets SET app_id=$1,updated_at=now() WHERE id=$2', [app.id, media.id]);
  }
  await client.query(
    "INSERT INTO security_auth_logs(actor_id,event_type,metadata) VALUES ($1,'MEDIA_ASSIGNED_AS_APP_COVER',$2)",
    [actorId, { media_id: media.id, app_id: app.id }],
  );
  return { ok: true, app_id: app.id, media_id: media.id, cover_image_url: media.public_url };
}
export async function archiveMediaAsset(client, actorId, mediaId) {
  const id = text(mediaId, 80, true);
  const media = (await client.query(
    "SELECT id,app_id,public_url,state FROM media_assets WHERE id=$1 FOR UPDATE",
    [id],
  )).rows[0];
  if (!media) fail(404, 'Media asset not found.');
  if (media.state === 'archived') return { ok: true };
  const inUse = (await client.query(
    'SELECT id FROM apps WHERE cover_image_url=$1 LIMIT 1',
    [media.public_url],
  )).rows[0];
  if (inUse) fail(409, 'This image is currently assigned as an app cover. Choose another cover before archiving it.');
  await client.query(
    "UPDATE media_assets SET state='archived',updated_at=now() WHERE id=$1",
    [id],
  );
  await client.query(
    "INSERT INTO security_auth_logs(actor_id,event_type,metadata) VALUES ($1,'MEDIA_ARCHIVED',$2)",
    [actorId, { media_id: id, app_id: media.app_id }],
  );
  return { ok: true };
}
