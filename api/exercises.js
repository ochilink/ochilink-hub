
import { cors, handleOptions } from './_lib.js';
import { getPool } from './_db.js';

export default async function handler(req, res) {
  cors(res);
  if (handleOptions(req, res)) return;
  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM exercise_library ORDER BY name');
    res.json(rows);
  } catch (e) {
    // fallback seed if DB not connected
    res.json([
      { name: 'Back Squat', muscle: 'Quads', pattern: 'Squat' },
      { name: 'RDL', muscle: 'Hamstrings', pattern: 'Hinge' },
      { name: 'Hip Thrust', muscle: 'Glutes', pattern: 'Bridge' },
      { name: 'Bulgarian Split Squat', muscle: 'Quads', pattern: 'Lunge' },
      { name: 'Seated Calf Raise', muscle: 'Calves', pattern: 'Isolation' }
    ]);
  }
}
