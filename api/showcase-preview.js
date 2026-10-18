import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { getPool } from './_db.js';
import { showcaseBlobOptions } from '../lib/showcase-blob.js';

const OBJECT_KEY = /^showcases\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(html|png|jpg|webp)$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_BYTES = 5 * 1024 * 1024;
const deny = (status, error) => ({ status, error });

export function createShowcasePreviewHandler({ poolProvider = getPool, retrieve, env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      // Phase one is an administrator-only, non-executable preview in Preview.
      if (env.VERCEL_ENV !== 'preview') throw deny(404, 'Not found.');
      if (req.method !== 'GET') throw deny(405, 'Method not allowed.');
      const token = String(req.headers?.cookie || '').match(/(?:^|;\s*)ochi_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (!token) throw deny(401, 'Authentication required.');
      const pool = poolProvider();
      const auth = await pool.query(
        `SELECT u.id FROM hub_sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active AND u.role='admin'`,
        [createHash('sha256').update(token).digest('hex')],
      );
      if (!auth.rows.length) throw deny(403, 'Administrator access required.');
      const appId = String(req.query?.app_id || '');
      if (!UUID.test(appId)) throw deny(400, 'Invalid application ID.');
      const record = await pool.query(
        `SELECT a.preview_kind AS kind, a.preview_object_key AS object_key
         FROM public.apps a
         WHERE a.id=$1 AND a.preview_kind IN ('html','image')
           AND EXISTS (
             SELECT 1 FROM public.showcase_upload_intents i
             WHERE i.app_id=a.id AND i.object_key=a.preview_object_key
               AND i.state='committed'
           )`,
        [appId],
      );
      const media = record.rows[0];
      if (!media || !OBJECT_KEY.test(media.object_key)) throw deny(404, 'Preview unavailable.');
      const ext = media.object_key.slice(media.object_key.lastIndexOf('.') + 1);
      if ((media.kind === 'html') !== (ext === 'html')) throw deny(404, 'Preview unavailable.');
      const getBlob = retrieve ?? (await import('@vercel/blob')).get;
      const blob = await getBlob(media.object_key, {
        access: 'private',
        ...showcaseBlobOptions(env),
      });
      if (!blob?.stream) throw deny(404, 'Preview unavailable.');
      const stream = typeof blob.stream.getReader === 'function'
        ? Readable.fromWeb(blob.stream) : blob.stream;
      const chunks = [];
      let total = 0;
      for await (const chunk of stream) {
        total += chunk.length;
        if (total > MAX_BYTES) throw deny(413, 'Preview exceeds size limit.');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (!bytes.length) throw deny(404, 'Preview unavailable.');
      // HTML is returned as text, never as executable text/html on the Hub origin.
      res.setHeader('Content-Type', media.kind === 'html' ? 'text/plain; charset=utf-8'
        : ({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[ext]));
      res.setHeader('Content-Disposition', 'inline');
      return res.status(200).send(bytes);
    } catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
        ? error.status : 500;
      if (status === 500) console.error('Showcase preview failed', { code: 'SHOWCASE_PREVIEW_FAILED' });
      return res.status(status).json({ error: status === 500 ? 'Preview unavailable.' : error.error });
    }
  };
}
export default createShowcasePreviewHandler();
