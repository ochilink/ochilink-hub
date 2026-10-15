
import { cors, handleOptions } from './_lib.js';
import { getPool } from './_db.js';

export default async function handler(req, res) {
  cors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { session_id, events } = req.body;
    if (!events?.length) return res.json({ ok: true });

    const pool = getPool();
    for (const ev of events.slice(0, 50)) {
      if (ev.type === 'click') {
        await pool.query(
          'INSERT INTO behavior_clicks (session_id, element_selector, page_path) VALUES ($1,$2,$3)',
          [session_id, ev.selector?.slice(0,120), ev.page || '/']
        );
      } else if (ev.type === 'scroll') {
        await pool.query(
          'INSERT INTO behavior_scroll (session_id, page_path, max_depth_pct, time_on_page_sec) VALUES ($1,$2,$3,$4)',
          [session_id, ev.page || '/', ev.depth_pct || 0, ev.time_on_page_sec || 0]
        );
      }
    }
    res.json({ ok: true, logged: events.length });
  } catch (e) {
    // Don't fail if DB not set - still return ok for frontend
    res.json({ ok: true, demo: true });
  }
}
