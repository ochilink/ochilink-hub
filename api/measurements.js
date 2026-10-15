
import { cors, handleOptions } from './_lib.js';
import { getPool } from './_db.js';
export default async function handler(req, res) {
  cors(res);
  if (handleOptions(req, res)) return;
  try {
    const pool = getPool();
    if (req.method === 'GET') {
      const { rows } = await pool.query('SELECT * FROM measurements ORDER BY date DESC LIMIT 100');
      res.json(rows);
    } else {
      const body = req.body;
      const { rows } = await pool.query('INSERT INTO measurements (user_id, date, weight, reps, lift) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *', ['00000000-0000-0000-0000-000000000001', body.date || new Date().toISOString().slice(0,10), body.weight || 0, body.reps || 1, body.lift || body.name || 'Lift']);
      res.json(rows[0] || body);
    }
  } catch(e) { res.json([]); }
}
