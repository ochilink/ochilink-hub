import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { createHandler } from '../api/hub.js';
const db = new PGlite();
const pool = {
    async query(sql, values) {
        const result = await db.query(sql, values);
        return {
            ...result,
            rowCount: result.affectedRows ?? result.rows.length,
        };
    },
    async connect() {
        return { query: pool.query, release() {} };
    },
};
const handler = createHandler(() => pool);
let adminId;
let adminCookie;
async function request(
    resource,
    method = 'GET',
    body = {},
    cookie = '',
    origin = 'https://hub.test',
) {
    const headers = {
        host: 'hub.test',
        origin,
        'content-type': 'application/json',
        cookie,
        'x-forwarded-for': '127.0.0.1',
    };
    const result = { status: 200, headers: {} };
    const res = {
        setHeader(k, v) {
            result.headers[k] = v;
        },
        status(code) {
            result.status = code;
            return res;
        },
        json(value) {
            result.body = value;
            return res;
        },
    };
    await handler({ method, query: { resource }, body, headers }, res);
    return result;
}
before(async () => {
    process.env.RATE_LIMIT_SECRET = 'testing-only-shared-rate-secret-32-bytes';
    const migration = await readFile(
        'database/migrations/001_ochilink_hub.sql',
        'utf8',
    );
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(
        await readFile('database/migrations/003_complete_hub.sql', 'utf8'),
    );
    await db.exec(
        await readFile('database/migrations/003_complete_hub.sql', 'utf8'),
    );
    await db.exec(await readFile('database/migrations/004_direct_booking.sql', 'utf8'));
    await db.exec(
        await readFile(
            'database/migrations/002_import_public_catalog.sql',
            'utf8',
        ),
    );
    await db.exec(
        await readFile(
            'database/migrations/009_app_cover_images.sql',
            'utf8',
        ),
    );
    await db.exec(
        await readFile(
            'database/migrations/002_import_public_catalog.sql',
            'utf8',
        ),
    );
    const ecosystemMigration = await readFile(
        'database/migrations/010_full_ecosystem_catalog.sql',
        'utf8',
    );
    await db.exec(ecosystemMigration);
    await db.exec(ecosystemMigration);
    await db.exec(
        await readFile(
            'database/migrations/011_normalize_extra_catalog_apps.sql',
            'utf8',
        ),
    );
    await db.exec(
        await readFile(
            'database/migrations/012_inline_app_cover_images.sql',
            'utf8',
        ),
    );
    const passwordHash = await bcrypt.hash('a-test-password-for-tests', 4);
    adminId = (
        await pool.query(
            "INSERT INTO users(email,password_hash,role) VALUES ('owner@example.test',$1,'admin') RETURNING id",
            [passwordHash],
        )
    ).rows[0].id;
});
after(async () => db.close());
test('full ecosystem catalog publishes 27 unique products and filters drafts', async () => {
    await pool.query(
        "INSERT INTO apps(slug,name) VALUES ('unpublished','Private draft')",
    );
    const result = await request('public');
    assert.equal(result.status, 200);
    assert.equal(result.body.apps.length, 27);
    assert.ok(
        result.body.apps.every(
            (a) =>
                !a.name.toLowerCase().includes('fitness') &&
                a.name !== 'Private draft',
        ),
    );
    assert.deepEqual(result.body.pricing, {
        hourly: 75,
        minimum: 150,
        currency: 'USD',
    });
    assert.equal(
        new Set(result.body.apps.map((app) => app.slug)).size,
        27,
    );
    assert.ok(
        result.body.apps.some(
            (app) =>
                app.slug === 'ochilink-database-cloud' &&
                app.tech.includes('PostgreSQL'),
        ),
    );
    assert.ok(
        result.body.apps.some(
            (app) =>
                app.slug === 'taxdrill-com' &&
                app.tech.includes('FastAPI') &&
                app.tech.includes('PostgreSQL'),
        ),
    );
    assert.ok(
        result.body.apps.some(
            (app) =>
                app.slug === 'ochilink-vault' &&
                app.status === 'Live' &&
                app.link === null,
        ),
    );
    assert.ok(
        result.body.apps.some(
            (app) =>
                app.slug === 'home-value' &&
                app.sort_order === 25 &&
                app.tech.includes('Real Estate'),
        ),
    );
    assert.ok(
        result.body.apps.some(
            (app) =>
                app.slug === 'real-estate-directory' &&
                app.sort_order === 26 &&
                app.tech.includes('React'),
        ),
    );
});
test('unauthenticated writes and foreign-origin login are rejected', async () => {
    assert.equal((await request('apps', 'POST')).status, 401);
    assert.equal(
        (await request('login', 'POST', {}, '', 'https://attacker.test'))
            .status,
        403,
    );
});
test('demo credentials no longer authenticate', async () => {
    assert.equal(
        (
            await request('login', 'POST', {
                email: 'admin@ochilink.com',
                password: 'admin123',
            })
        ).status,
        401,
    );
});
test('real login creates a hashed session in an HttpOnly secure cookie', async () => {
    const result = await request('login', 'POST', {
        email: 'OWNER@example.test',
        password: 'a-test-password-for-tests',
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.user.role, 'admin');
    assert.match(
        result.headers['Set-Cookie'],
        /HttpOnly; Secure; SameSite=Strict/,
    );
    adminCookie = result.headers['Set-Cookie'].split(';')[0];
    const saved = (await pool.query('SELECT * FROM hub_sessions')).rows[0];
    assert.equal(
        saved.token_hash,
        createHash('sha256').update(adminCookie.split('=')[1]).digest('hex'),
    );
    assert.equal((await request('admin', 'GET', {}, adminCookie)).status, 200);
    const log = (await pool.query(
        "SELECT metadata FROM security_auth_logs WHERE event_type='LOGIN_SUCCESS' ORDER BY timestamp DESC LIMIT 1"
    )).rows[0].metadata;
    assert.equal(log.category, 'login');
    assert.equal(log.browser, 'Other');
    assert.match(log.ip_hash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(log).includes('127.0.0.1'), false);
    assert.equal(Object.hasOwn(log, 'user_agent'), false);
});
test('admin app CRUD persists, controls publication and audits writes', async () => {
    const app = {
        name: 'Test app',
        slug: 'test-app',
        description: 'Saved record',
        link: 'https://example.test',
        cover_image_url: 'https://images.example.test/test-app.webp',
        tech: ['React'],
        status: 'Coming Soon',
        is_published: false,
        sort_order: 20,
    };
    const created = await request('apps', 'POST', app, adminCookie);
    assert.equal(created.status, 200);
    const id = created.body.app.id;
    assert.ok(!(await request('public')).body.apps.some((a) => a.id === id));
    const updated = await request(
        'apps',
        'PUT',
        { ...app, id, status: 'Live', is_published: true },
        adminCookie,
    );
    assert.equal(updated.status, 200);
    assert.ok(
        (await request('public')).body.apps.some(
            (a) =>
                a.id === id &&
                a.status === 'Live' &&
                a.cover_image_url === 'https://images.example.test/test-app.webp',
        ),
    );
    assert.equal(
        (await request('apps', 'DELETE', { id }, adminCookie)).status,
        200,
    );
    assert.equal(
        (
            await pool.query(
                "SELECT count(*)::int AS count FROM security_auth_logs WHERE event_type LIKE 'APP_%'",
            )
        ).rows[0].count,
        3,
    );
});
test('admin app covers accept safe inline raster images and reject unsafe data payloads', async () => {
    const base = {
        name: 'Inline cover',
        slug: 'inline-cover',
        description: '',
        link: null,
        tech: ['React'],
        status: 'Coming Soon',
        is_published: false,
        sort_order: 999,
    };
    const safeCover = 'data:image/jpeg;base64,' + Buffer.from('tiny-test-image').toString('base64');
    const created = await request(
        'apps',
        'POST',
        { ...base, cover_image_url: safeCover },
        adminCookie,
    );
    assert.equal(created.status, 200);
    assert.equal(created.body.app.cover_image_url, safeCover);

    const unsafe = await request(
        'apps',
        'POST',
        {
            ...base,
            slug: 'unsafe-inline-cover',
            cover_image_url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        },
        adminCookie,
    );
    assert.equal(unsafe.status, 400);

    await request('apps', 'DELETE', { id: created.body.app.id }, adminCookie);
});

test('invalid links, duplicate slugs and invalid identifiers are handled', async () => {
    const app = {
        name: 'Invalid link',
        slug: 'invalid-link',
        description: '',
        link: 'javascript:alert(1)',
        tech: [],
        status: 'Live',
        is_published: true,
        sort_order: 0,
    };
    assert.equal((await request('apps', 'POST', app, adminCookie)).status, 400);
    assert.equal(
        (
            await request(
                'apps',
                'POST',
                {
                    ...app,
                    slug: 'bad-cover',
                    link: null,
                    cover_image_url: 'javascript:alert(1)',
                },
                adminCookie,
            )
        ).status,
        400,
    );
    assert.equal(
        (
            await request(
                'apps',
                'POST',
                { ...app, slug: 'pbris-com', link: null },
                adminCookie,
            )
        ).status,
        409,
    );
    assert.equal(
        (await request('apps', 'DELETE', { id: 'bad-id' }, adminCookie)).status,
        400,
    );
});
test('pricing update is visible publicly', async () => {
    assert.equal(
        (
            await request(
                'pricing',
                'PUT',
                { hourly: 90, minimum: 180 },
                adminCookie,
            )
        ).status,
        200,
    );
    assert.equal((await request('public')).body.pricing.hourly, 90);
});
test('customer cannot access admin even with a valid database session', async () => {
    const id = (
        await pool.query(
            "INSERT INTO users(email,password_hash,role) VALUES ('reader@example.test','unused','customer') RETURNING id",
        )
    ).rows[0].id;
    const token = 'a'.repeat(64);
    await pool.query(
        "INSERT INTO hub_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '15 minutes')",
        [createHash('sha256').update(token).digest('hex'), id],
    );
    assert.equal(
        (await request('admin', 'GET', {}, 'ochi_session=' + token)).status,
        403,
    );
});
test('original dashboard receives seven real audit days and database totals', async () => {
    const result = await request('admin', 'GET', {}, adminCookie);
    assert.equal(result.status, 200);
    assert.equal(result.body.activity.length, 7);
    assert.equal(
        result.body.activity.reduce((sum, day) => sum + day.events, 0),
        (
            await pool.query(
                'SELECT count(*)::int AS count FROM security_auth_logs',
            )
        ).rows[0].count,
    );
    assert.equal(result.body.totals.users, 2);
    const expected = await pool.query(`
        SELECT day::date::text AS day,
            count(l.log_id) FILTER (WHERE l.event_type IN ('LOGIN_FAILED','MFA_FAILED'))::int AS failed_auth,
            count(l.log_id) FILTER (WHERE l.event_type='RATE_LIMITED')::int AS blocked
        FROM generate_series(current_date-6,current_date,interval '1 day') AS day
        LEFT JOIN security_auth_logs l
            ON l.timestamp>=day AND l.timestamp<day+interval '1 day'
        GROUP BY day ORDER BY day
    `);
    assert.deepEqual(
        result.body.activity.map(({day, failed_auth, blocked}) => ({day, failed_auth, blocked})),
        expected.rows,
    );
    assert.ok(result.body.activity.every((day) =>
        Number.isInteger(day.failed_auth) && day.failed_auth >= 0 &&
        Number.isInteger(day.blocked) && day.blocked >= 0
    ));
});
test('user controls persist roles, revoke changed-user sessions and audit unlocks', async () => {
    const id = (
        await pool.query(
            "SELECT id FROM users WHERE email='reader@example.test'",
        )
    ).rows[0].id;
    assert.equal(
        (
            await request(
                'users',
                'PUT',
                { id, action: 'role', role: 'staff' },
                adminCookie,
            )
        ).status,
        200,
    );
    assert.equal(
        (await pool.query('SELECT role FROM users WHERE id=$1', [id])).rows[0]
            .role,
        'staff',
    );
    assert.equal(
        (
            await pool.query(
                'SELECT count(*)::int AS count FROM hub_sessions WHERE user_id=$1',
                [id],
            )
        ).rows[0].count,
        0,
    );
    await pool.query(
        "UPDATE users SET failed_attempts=5,locked_until=now()+interval '15 minutes' WHERE id=$1",
        [id],
    );
    assert.equal(
        (await request('users', 'PUT', { id, action: 'unlock' }, adminCookie))
            .status,
        200,
    );
    assert.equal(
        (await pool.query('SELECT locked_until FROM users WHERE id=$1', [id]))
            .rows[0].locked_until,
        null,
    );
    assert.equal(
        (
            await request(
                'users',
                'PUT',
                { id: adminId, action: 'role', role: 'customer' },
                adminCookie,
            )
        ).status,
        400,
    );
    assert.equal(
        (
            await request(
                'users',
                'PUT',
                { id, action: 'role', role: 'owner' },
                adminCookie,
            )
        ).status,
        400,
    );
});
test('server rejects expired sessions and logout revokes sessions', async () => {
    await pool.query(
        "UPDATE hub_sessions SET expires_at=now()-interval '1 minute' WHERE user_id=$1",
        [adminId],
    );
    assert.equal((await request('admin', 'GET', {}, adminCookie)).status, 401);
    const loggedIn = await request('login', 'POST', {
        email: 'owner@example.test',
        password: 'a-test-password-for-tests',
    });
    const cookie = loggedIn.headers['Set-Cookie'].split(';')[0];
    assert.equal((await request('logout', 'POST', {}, cookie)).status, 200);
    assert.equal((await request('admin', 'GET', {}, cookie)).status, 401);
});
test('repeated failed logins lock accounts and are rate limited', async () => {
    for (let i = 0; i < 5; i++)
        assert.equal(
            (
                await request('login', 'POST', {
                    email: 'owner@example.test',
                    password: 'wrong',
                })
            ).status,
            401,
        );
    assert.ok(
        (
            await pool.query('SELECT locked_until FROM users WHERE id=$1', [
                adminId,
            ])
        ).rows[0].locked_until,
    );
    for (let i = 0; i < 3; i++)
        await request('login', 'POST', {
            email: 'owner@example.test',
            password: 'wrong',
        });
    assert.equal(
        (
            await request('login', 'POST', {
                email: 'owner@example.test',
                password: 'wrong',
            })
        ).status,
        429,
    );
});
test('consultation requests persist without promising a scheduled appointment', async () => {
    const result = await request('consultations', 'POST', {
        client_name: 'Visitor',
        client_email: 'visitor@example.test',
        notes: 'Build an app',
    });
    assert.equal(result.status, 201);
    const row = (await pool.query('SELECT * FROM consultations')).rows[0];
    assert.equal(row.status, 'Requested');
    assert.equal(row.scheduled_at, null);
    assert.equal(
        (
            await request('consultations', 'POST', {
                client_name: 'Visitor',
                client_email: 'bad-email',
            })
        ).status,
        400,
    );
});
