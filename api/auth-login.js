
import { cors, handleOptions } from './_lib.js';
import { getPool } from './_db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  cors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;
  const normalized = email?.toLowerCase().trim();

  // Demo fallback if DB not connected - for live demo
  const demoUsers = {
    'admin@ochilink.com': { id: '1', role: 'admin', password: 'admin123' },
    'staff@ochilink.com': { id: '2', role: 'staff', password: 'staff123' },
    'customer@ochilink.com': { id: '3', role: 'customer', password: 'cust123' }
  };

  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [normalized]);
    const user = rows[0];
    if (!user) throw new Error('no-db-fallback');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: user.role==='admin' ? '15m' : '7d' });
    const redirects = { admin: '/admin', staff: '/staff', vendor: '/vendor', customer: '/portal' };
    return res.json({ ok: true, role: user.role, redirect: redirects[user.role] || '/dashboard', token });

  } catch (e) {
    // Demo fallback
    const demo = demoUsers[normalized];
    if (demo && demo.password === password) {
      const token = 'demo-'+demo.role+'-token';
      const redirects = { admin: '/admin', staff: '/dashboard', customer: '/portal' };
      return res.json({ ok: true, role: demo.role, redirect: redirects[demo.role], token, demo: true });
    }
    return res.status(401).json({ error: 'Invalid email or password' });
  }
}
