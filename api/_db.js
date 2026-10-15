
import { Pool } from 'pg';

let pool;
export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or POSTGRES_URL not set');
  }
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10,
  });
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}
