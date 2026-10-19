// Opt-in integration test. Never use a Production or remote database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

test('two PostgreSQL connections cannot reserve the one-time smoke test concurrently', {
  skip: !process.env.SHOWCASE_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.SHOWCASE_TEST_DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
      url.pathname !== '/ochilink_showcase_test') {
    throw new Error('Requires the dedicated local ochilink_showcase_test database.');
  }
  const pool = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 3000 });
  let first;
  let second;
  const userId = randomUUID();
  try {
    first = await pool.connect();
    second = await pool.connect();
    assert.notEqual(first.processID, second.processID);
    const existing = await first.query('SELECT count(*)::int AS n FROM hub_live_smoke_tests');
    if (existing.rows[0].n !== 0) throw new Error('Dedicated smoke-test table must be empty.');
    await first.query('INSERT INTO users(id) VALUES ($1)', [userId]);
    await first.query('BEGIN');
    const firstInsert = await first.query(
      'INSERT INTO hub_live_smoke_tests(actor_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id',
      [userId],
    );
    assert.equal(firstInsert.rowCount, 1);
    await second.query('BEGIN');
    await second.query("SET LOCAL lock_timeout = '250ms'");
    await assert.rejects(
      second.query(
        'INSERT INTO hub_live_smoke_tests(actor_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id',
        [userId],
      ),
      (error) => error.code === '55P03',
    );
    await second.query('ROLLBACK');
    await first.query('COMMIT');
    const afterCommit = await second.query(
      'INSERT INTO hub_live_smoke_tests(actor_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id',
      [userId],
    );
    assert.equal(afterCommit.rowCount, 0);
    const count = await first.query('SELECT count(*)::int AS n FROM hub_live_smoke_tests');
    assert.equal(count.rows[0].n, 1);
  } finally {
    if (second) { try { await second.query('ROLLBACK'); } catch {} }
    if (first) { try { await first.query('ROLLBACK'); } catch {} }
    if (first) {
      try {
        await first.query('DELETE FROM hub_live_smoke_tests WHERE actor_id=$1', [userId]);
        await first.query('DELETE FROM users WHERE id=$1', [userId]);
      } finally { first.release(); }
    }
    second?.release();
    await pool.end();
  }
});
