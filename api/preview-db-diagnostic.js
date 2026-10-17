import { createHash } from 'node:crypto';
import { getPool } from './_db.js';

// Temporary, read-only Preview diagnostic. Never return credentials or records.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ error: 'Not found.' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const token = String(req.headers?.cookie || '').match(/(?:^|;\s*)ochi_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const pool = getPool();
    const auth = await pool.query(
      `SELECT u.id FROM hub_sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active AND u.role='admin'`,
      [createHash('sha256').update(token).digest('hex')],
    );
    if (!auth.rows.length) return res.status(403).json({ error: 'Administrator access required.' });
    const result = await pool.query(`
      SELECT current_database() AS database_name,
             current_user AS database_role,
             current_schema() AS current_schema,
             current_setting('search_path') AS search_path,
             to_regclass('showcase_upload_intents') IS NOT NULL AS unqualified_exists,
             to_regclass('public.showcase_upload_intents') IS NOT NULL AS qualified_exists,
             EXISTS (
               SELECT 1 FROM public.hub_schema_migrations
               WHERE version='007_showcase_upload_intents'
             ) AS migration_007_recorded
    `);
    return res.status(200).json({ ok: true, ...result.rows[0] });
  } catch {
    console.error('Preview database diagnostic failed', { code: 'PREVIEW_DB_DIAGNOSTIC_FAILED' });
    return res.status(500).json({ error: 'Diagnostic unavailable.' });
  }
}
