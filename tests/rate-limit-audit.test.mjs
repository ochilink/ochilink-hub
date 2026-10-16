import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../api/hub.js';

test('isolated booking rate limits return 429, log blocks, and isolate IP buckets', async () => {
    const db = new PGlite();
    const pool = {
        query: (sql, values) => db.query(sql, values),
        async connect() {
            return { query: pool.query, release() {} };
        },
    };
    const original = {
        RATE_LIMIT_SECRET: process.env.RATE_LIMIT_SECRET,
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
    };
    try {
        process.env.RATE_LIMIT_SECRET = 'isolated-rate-limit-test-secret-32-characters';
        process.env.PUBLIC_SITE_URL = 'https://hub.test';
        for (const migration of ['001_ochilink_hub', '003_complete_hub', '004_direct_booking']) {
            await db.exec(await readFile(`database/migrations/${migration}.sql`, 'utf8'));
        }
        const handler = createHandler(() => pool);
        const invalidSlot = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        async function attempt(ip) {
            const result = { status: 200 };
            const res = {
                setHeader() {},
                status(code) { result.status = code; return res; },
                json(body) { result.body = body; return res; },
            };
            await handler({
                method: 'POST',
                query: { resource: 'consultations' },
                headers: {
                    host: 'hub.test',
                    origin: 'https://hub.test',
                    'content-type': 'application/json',
                    'x-forwarded-for': ip,
                },
                body: {
                    client_name: 'Rate Limit Test',
                    client_email: 'test@example.test',
                    slot_id: invalidSlot,
                    duration_minutes: 60,
                },
            }, res);
            return result;
        }
        for (let i = 0; i < 5; i++) {
            assert.equal((await attempt('192.0.2.10')).status, 409);
        }
        assert.equal((await attempt('192.0.2.10')).status, 429);
        assert.equal((await attempt('192.0.2.10')).status, 429);
        const logs = await pool.query(
            "SELECT event_type FROM security_auth_logs WHERE event_type='RATE_LIMITED'",
        );
        assert.equal(logs.rows.length, 2);
        assert.equal((await attempt('192.0.2.11')).status, 409);
        const buckets = await pool.query(
            'SELECT attempts FROM hub_rate_limits ORDER BY attempts DESC',
        );
        assert.deepEqual(buckets.rows.map((r) => r.attempts), [7, 1]);
        assert.equal((await pool.query('SELECT count(*)::int AS count FROM consultations')).rows[0].count, 0);
    } finally {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await db.close();
    }
});
