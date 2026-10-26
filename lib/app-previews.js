import { createPreviewUploadAuthorization, validatePreviewBlobUrl } from './preview-storage.js';

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function cleanFilename(value) {
  const name = String(value || '').trim().slice(0,180);
  if (!name) fail(400, 'Choose an HTML preview file.');
  if (!/\.html?$/i.test(name)) fail(400, 'Preview file must be HTML.');
  return name.replace(/[\\/\0\r\n]+/g,'-');
}
async function appForAdmin(pool, appId) {
  const row = (await pool.query('SELECT id,slug,name,status,link,preview_enabled FROM apps WHERE id=$1',[appId])).rows[0];
  if (!row) fail(404, 'App not found.');
  return row;
}
export async function listAppPreviews(pool, appId = null) {
  const params = [];
  let where = '';
  if (appId) { params.push(appId); where = 'WHERE p.app_id=$1'; }
  const rows = (await pool.query(
    'SELECT p.id,p.app_id,p.version,p.pathname,p.public_url,p.original_name,p.byte_size,p.content_type,p.state,p.is_active,p.created_at,p.activated_at,a.slug,a.name,a.status,a.link,a.preview_enabled FROM app_previews p JOIN apps a ON a.id=p.app_id ' + where + ' ORDER BY a.name,p.version DESC LIMIT 500',
    params,
  )).rows;
  const apps = (await pool.query('SELECT id,slug,name,status,link,preview_enabled FROM apps ORDER BY sort_order,name')).rows;
  return { apps, previews: rows };
}
export async function beginAppPreviewUpload(pool, actorId, body) {
  const app = await appForAdmin(pool, body.app_id);
  const filename = cleanFilename(body.filename);
  const byteSize = Number(body.byte_size);
  if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > 8 * 1024 * 1024) fail(400, 'HTML preview must be between 1 byte and 8 MB.');
  const version = Number((await pool.query('SELECT coalesce(max(version),0)+1 AS version FROM app_previews WHERE app_id=$1',[app.id])).rows[0].version);
  const auth = await createPreviewUploadAuthorization(app.slug, filename, byteSize);
  const row = (await pool.query('INSERT INTO app_previews (app_id,version,pathname,public_url,original_name,byte_size,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,version,pathname',[app.id,version,auth.pathname,'pending://preview',filename,byteSize,actorId])).rows[0];
  await pool.query("INSERT INTO security_auth_logs(actor_id,event_type,metadata) VALUES ($1,'APP_PREVIEW_UPLOAD_AUTHORIZED',$2)",[actorId,{ app_id:app.id, preview_id:row.id, version, byte_size:byteSize }]);
  return { preview_id: row.id, version, pathname: auth.pathname, upload_url: auth.upload_url, expected_host: auth.expected_host, expires_at: auth.expires_at };
}
export async function completeAppPreviewUpload(client, actorId, body) {
  const preview = (await client.query('SELECT p.*,a.id AS app_exists FROM app_previews p JOIN apps a ON a.id=p.app_id WHERE p.id=$1 FOR UPDATE',[body.preview_id])).rows[0];
  if (!preview) fail(404, 'Preview upload not found.');
  if (preview.state === 'ready') return preview;
  if (preview.state !== 'pending') fail(409, 'Preview upload cannot be completed.');
  if (String(body.pathname || '') !== preview.pathname) fail(400, 'Preview path does not match.');
  const publicUrl = validatePreviewBlobUrl(body.public_url, preview.pathname);
  await client.query('UPDATE app_previews SET is_active=false WHERE app_id=$1',[preview.app_id]);
  const ready = (await client.query("UPDATE app_previews SET public_url=$1,etag=$2,state='ready',is_active=true,activated_at=now() WHERE id=$3 RETURNING *",[publicUrl,String(body.etag || '').slice(0,300)||null,preview.id])).rows[0];
  await client.query('UPDATE apps SET preview_enabled=true,updated_at=now() WHERE id=$1',[preview.app_id]);
  await client.query("INSERT INTO security_auth_logs(actor_id,event_type,metadata) VALUES ($1,'APP_PREVIEW_PUBLISHED',$2)",[actorId,{ app_id:preview.app_id, preview_id:preview.id, version:preview.version }]);
  return ready;
}
export async function setPreviewEnabled(client, actorId, appId, enabled) {
  await appForAdmin(client, appId);
  if (enabled) {
    const active = (await client.query("SELECT id FROM app_previews WHERE app_id=$1 AND state='ready' AND is_active LIMIT 1",[appId])).rows[0];
    if (!active) fail(409, 'Upload a ready preview before enabling it.');
  }
  await client.query('UPDATE apps SET preview_enabled=$1,updated_at=now() WHERE id=$2',[!!enabled,appId]);
  await client.query("INSERT INTO security_auth_logs(actor_id,event_type,metadata) VALUES ($1,'APP_PREVIEW_VISIBILITY_CHANGED',$2)",[actorId,{ app_id:appId, enabled:!!enabled }]);
  return { ok:true, enabled:!!enabled };
}
export async function activatePreviewVersion(client, actorId, previewId) {
  const row = (await client.query('SELECT id,app_id,version,state FROM app_previews WHERE id=$1 FOR UPDATE',[previewId])).rows[0];
  if (!row) fail(404,'Preview not found.');
  if (row.state !== 'ready') fail(409,'Only ready previews can be activated.');
  await client.query('UPDATE app_previews SET is_active=false WHERE app_id=$1',[row.app_id]);
  await client.query('UPDATE app_previews SET is_active=true,activated_at=now() WHERE id=$1',[previewId]);
  await client.query('UPDATE apps SET preview_enabled=true,updated_at=now() WHERE id=$1',[row.app_id]);
  await client.query("INSERT INTO security_auth_logs(actor_id,event_type,metadata) VALUES ($1,'APP_PREVIEW_VERSION_ACTIVATED',$2)",[actorId,{ app_id:row.app_id, preview_id:previewId, version:row.version }]);
  return { ok:true };
}
