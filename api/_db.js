import { Pool } from 'pg';

let pool;
export function getPool() {
    if (pool) return pool;
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw new Error('Database is not configured.');
    const url = new URL(connectionString);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!local) url.searchParams.set('sslmode', 'verify-full');
    pool = new Pool({
        connectionString: url.toString(),
        max: 3,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000
    });
    return pool;
}
export async function query(text, params) {
    return getPool().query(text, params);
}
