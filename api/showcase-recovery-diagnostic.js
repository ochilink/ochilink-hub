import { timingSafeEqual } from 'node:crypto';
import { getPool } from './_db.js';
import { observeShowcaseRecovery } from '../lib/showcase-recovery-monitor.js';

export function createShowcaseRecoveryDiagnosticHandler({
  env = process.env,
  poolProvider = getPool,
  observe = observeShowcaseRecovery,
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (env.VERCEL_ENV !== 'preview') return res.status(404).json({ error: 'Not found.' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    const secret = env.CRON_SECRET;
    const actual = String(req.headers?.authorization || '');
    const expected = secret ? 'Bearer ' + secret : '';
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b))
      return res.status(401).json({ error: 'Unauthorized' });
    try {
      const recovery = await observe(poolProvider(), { env });
      if (recovery.status === 'failed') return res.status(503).json({ error: 'Recovery observation unavailable.' });
      return res.status(200).json({ ok: true, recovery });
    } catch {
      return res.status(503).json({ error: 'Recovery observation unavailable.' });
    }
  };
}
export default createShowcaseRecoveryDiagnosticHandler();
