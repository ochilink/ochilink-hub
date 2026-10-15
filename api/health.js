import { getPool } from './_db.js';
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try {
        await getPool().query('SELECT 1');
        return res.json({ ok: true, db: 'connected' });
    } catch {
        return res.status(503).json({ ok: false, db: 'unavailable' });
    }
}
