
import { cors, handleOptions } from './_lib.js';
import { getPool } from './_db.js';

export default async function handler(req, res) {
  cors(res);
  if (handleOptions(req, res)) return;
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected', time: new Date().toISOString() });
  } catch (e) {
    res.json({ ok: true, db: 'disconnected - set DATABASE_URL', error: e.message });
  }
}
