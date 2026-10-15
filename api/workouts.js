
import { cors, handleOptions } from './_lib.js';
import { getPool } from './_db.js';

export default async function handler(req, res) {
  cors(res);
  if (handleOptions(req, res)) return;

  const pool = getPool();
  try {
    if (req.method === 'GET') {
      const { rows } = await pool.query(`
        SELECT w.*, json_agg(json_build_object('exercise_name', we.exercise_name, 'muscle', we.muscle, 'sets', (SELECT json_agg(s) FROM sets s WHERE s.workout_exercise_id = we.id))) as exercises
        FROM workouts w
        LEFT JOIN workout_exercises we ON we.workout_id = w.id
        GROUP BY w.id ORDER BY w.date DESC LIMIT 50
      `);
      res.json(rows);
    } else if (req.method === 'POST') {
      const { date, name, duration, exercises } = req.body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: [workout] } = await client.query(
          'INSERT INTO workouts (user_id, date, name, duration) VALUES ($1,$2,$3,$4) RETURNING *',
          ['00000000-0000-0000-0000-000000000001', date || new Date().toISOString().slice(0,10), name || 'Workout', duration || 60]
        );
        if (exercises) {
          for (let i=0; i<exercises.length; i++) {
            const ex = exercises[i];
            const { rows: [we] } = await client.query(
              'INSERT INTO workout_exercises (workout_id, exercise_name, muscle, pattern, position) VALUES ($1,$2,$3,$4,$5) RETURNING id',
              [workout.id, ex.exercise_name, ex.muscle || 'Quads', ex.pattern || 'Squat', i]
            );
            for (let j=0; j<(ex.sets||[]).length; j++) {
              const s = ex.sets[j];
              await client.query(
                'INSERT INTO sets (workout_exercise_id, set_number, reps, weight) VALUES ($1,$2,$3,$4)',
                [we.id, j+1, s.reps, s.weight]
              );
            }
          }
        }
        await client.query('COMMIT');
        res.json(workout);
      } catch(e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
