// Opt-in integration test against a dedicated local PostgreSQL database.
// Set SHOWCASE_TEST_DATABASE_URL to a disposable DB; never point to production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

test('two real PostgreSQL connections serialize publisher and recovery locks', {
  skip: !process.env.SHOWCASE_TEST_DATABASE_URL,
}, async () => {
  const url = process.env.SHOWCASE_TEST_DATABASE_URL;
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname))
    throw new Error('Integration test requires local PostgreSQL only.');
  const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 3000 });
  const publisher = await pool.connect();
  const recovery = await pool.connect();
  try {
    assert.notEqual(publisher.processID, recovery.processID);
    await publisher.query('BEGIN');
    await publisher.query('SELECT pg_advisory_xact_lock(73419, 11)');
    await recovery.query('BEGIN');
    const blocked = await recovery.query(
      'SELECT pg_try_advisory_xact_lock(73419, 11) AS acquired',
    );
    assert.equal(blocked.rows[0].acquired, false);
    await publisher.query('COMMIT');
    const acquired = await recovery.query(
      'SELECT pg_try_advisory_xact_lock(73419, 11) AS acquired',
    );
    assert.equal(acquired.rows[0].acquired, true);
    await recovery.query('ROLLBACK');
  } finally {
    try { await publisher.query('ROLLBACK'); } catch {}
    try { await recovery.query('ROLLBACK'); } catch {}
    publisher.release();
    recovery.release();
    await pool.end();
  }
});
