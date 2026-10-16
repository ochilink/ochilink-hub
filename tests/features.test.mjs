import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import { createHandler } from '../api/hub.js';
import { createWebhookHandler } from '../api/stripe-webhook.js';
import {
    digest,
    seal,
    unseal,
    base32,
    totp,
    totpStep,
} from '../lib/security.js';
import { flushMail } from '../lib/mail.js';
import {
    checkout,
    prepareCheckout,
    processPaymentEvent,
} from '../lib/payments.js';
const db = new PGlite();
const pool = {
    async query(sql, values) {
        const r = await db.query(sql, values);
        return { ...r, rowCount: r.affectedRows ?? r.rows.length };
    },
    async connect() {
        return { query: pool.query, release() {} };
    },
};
const handler = createHandler(() => pool);
let adminId, cookie, consultationId, slotId, mfaCodes;
const password = 'correct-private-test-password';
async function request(resource, method = 'GET', body = {}, session = cookie) {
    const output = { status: 200, headers: {} };
    const res = {
        setHeader(k, v) {
            output.headers[k] = v;
        },
        status(s) {
            output.status = s;
            return res;
        },
        json(v) {
            output.body = v;
            return res;
        },
    };
    await handler(
        {
            method,
            query: { resource },
            body,
            headers: {
                host: 'hub.test',
                origin: 'https://hub.test',
                'content-type': 'application/json',
                cookie: session || '',
                'x-forwarded-for': '127.0.0.1',
            },
        },
        res,
    );
    return output;
}
async function tx(fn) {
    await pool.query('BEGIN');
    try {
        const r = await fn(pool);
        await pool.query('COMMIT');
        return r;
    } catch (e) {
        await pool.query('ROLLBACK');
        throw e;
    }
}
before(async () => {
    process.env.RATE_LIMIT_SECRET = 'testing-only-rate-secret-32-characters';
    process.env.APP_ENCRYPTION_KEY = 'ab'.repeat(32);
    process.env.PUBLIC_SITE_URL = 'https://hub.test';
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
    for (const file of [
        '001_ochilink_hub.sql',
        '003_complete_hub.sql',
        '004_direct_booking.sql',
        '004_direct_booking.sql',
    ])
        await db.exec(await readFile('database/migrations/' + file, 'utf8'));
    adminId = (
        await pool.query(
            "INSERT INTO users(email,password_hash,role) VALUES ('owner@example.test',$1,'admin') RETURNING id",
            [await bcrypt.hash(password, 4)],
        )
    ).rows[0].id;
    cookie = (
        await request(
            'login',
            'POST',
            { email: 'owner@example.test', password },
            '',
        )
    ).headers['Set-Cookie'].split(';')[0];
});
beforeEach(async () => {
    await pool.query('DELETE FROM hub_rate_limits');
});
after(async () => db.close());
test('encryption authenticates payloads and TOTP matches RFC 6238 vectors', () => {
    assert.equal(unseal(seal('private-secret')), 'private-secret');
    assert.throws(() => unseal(seal('secret').slice(0, -2) + 'xx'));
    const secret = base32(Buffer.from('12345678901234567890'));
    assert.equal(totp(secret, Math.floor(59000 / 30000), 8), '94287082');
    assert.equal(totpStep(secret, totp(secret, 1), 0, 59000), 1);
    assert.equal(totpStep(secret, totp(secret, 1), 1, 59000), null);
});
test('availability publishes real slots and refuses overlapping slots', async () => {
    const starts = new Date(Date.now() + 86400000).toISOString(),
        ends = new Date(Date.now() + 90000000).toISOString();
    assert.equal(
        (
            await request('availability-admin', 'POST', {
                starts_at: starts,
                ends_at: ends,
            })
        ).status,
        200,
    );
    assert.equal(
        (
            await request('availability-admin', 'POST', {
                starts_at: starts,
                ends_at: ends,
            })
        ).status,
        409,
    );
    const publicSlots = await request('availability');
    slotId = publicSlots.body.slots[0].id;
    assert.equal(publicSlots.body.slots.length, 1);
    assert.equal(
        (
            await request('availability-admin', 'POST', {
                starts_at: 'invalid',
                ends_at: ends,
            })
        ).status,
        400,
    );
});
test('legacy request for a slot reserves it and a second request cannot double-book', async () => {
    const tooLong = await request('consultations', 'POST', {client_name:'Client',client_email:'client@example.test',slot_id:slotId,duration_minutes:180,booking:false}, '');
    assert.equal(tooLong.status, 409);
    assert.equal((await pool.query('SELECT id FROM consultations')).rows.length, 0);
    const body = {
        client_name: 'Client',
        client_email: 'client@example.test',
        notes: 'Build an app',
        phone: '+15555550100',
        service: 'Custom App',
        duration_minutes: 60,
        booking: false,
        slot_id: slotId,
    };
    assert.equal(
        (await request('consultations', 'POST', body, '')).status,
        201,
    );
    consultationId = (await pool.query('SELECT id FROM consultations')).rows[0]
        .id;
    assert.equal(
        (await request('consultations', 'POST', body, '')).status,
        409,
    );
    assert.equal((await request('availability')).body.slots.length, 0);
    assert.equal(
        (await request('availability-admin', 'DELETE', { id: slotId })).status,
        409,
    );
    const row = (await pool.query('SELECT * FROM consultations')).rows[0];
    assert.equal(row.status, 'Requested');
    assert.ok(row.reserved_until);
    assert.equal(row.duration_minutes, 60);
    assert.equal(Number(row.amount), 150);
    assert.match(row.notes, /Service: Custom App/);
    const publicSlots = (await request('availability')).body;
    assert.equal(publicSlots.booked_slots.length, 1);
    assert.equal(publicSlots.booked_slots[0].is_booked, true);
    assert.equal(JSON.stringify(publicSlots).includes('Client'), false);
});
test('consultation editor updates details, quote and schedule and queues email', async () => {
    const result = await request('consultation-admin', 'PUT', {
        id: consultationId,
        client_name: 'Updated client',
        client_email: 'client@example.test',
        notes: 'Updated details',
        amount: 150,
        status: 'Scheduled',
        slot_id: slotId,
    });
    assert.equal(result.status, 200);
    const row = (await pool.query('SELECT * FROM consultations')).rows[0];
    assert.equal(row.client_name, 'Updated client');
    assert.equal(Number(row.amount), 150);
    assert.equal(row.status, 'Scheduled');
    assert.equal(
        (
            await request('consultation-admin', 'PUT', {
                id: consultationId,
                client_name: 'Client',
                client_email: 'bad',
                amount: 150,
                status: 'Scheduled',
                slot_id: slotId,
            })
        ).status,
        400,
    );
    assert.ok(
        (
            await pool.query(
                'SELECT count(*)::int AS count FROM hub_email_outbox',
            )
        ).rows[0].count > 0,
    );
});
test('analytics requires consent, rejects admin/private paths and aggregates actual events', async () => {
    const session = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        body = { session, path: '/', event_type: 'view' };
    assert.equal((await request('analytics', 'POST', body, '')).status, 400);
    assert.equal(
        (await request('analytics', 'POST', { ...body, consent: true }, ''))
            .status,
        200,
    );
    await request('analytics', 'POST', { ...body, consent: true }, '');
    await request(
        'analytics',
        'POST',
        {
            ...body,
            consent: true,
            event_type: 'click',
            cell: 10,
            target: 'button',
        },
        '',
    );
    await request(
        'analytics',
        'POST',
        { ...body, consent: true, event_type: 'scroll', depth: 75 },
        '',
    );
    assert.equal(
        (
            await request(
                'analytics',
                'POST',
                { ...body, path: '/admin', consent: true },
                '',
            )
        ).status,
        400,
    );
    const analytics = (await request('analytics-admin')).body;
    assert.equal(analytics.pages[0].views, 1);
    assert.equal(analytics.clicks[0].count, 1);
    assert.equal(analytics.scroll[0].depth, 75);
});
test('email worker retries failures and uses provider idempotency without plaintext tokens at rest', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.MAIL_FROM = 'Ochilink <verified@example.test>';
    let calls = 0;
    const failing = await flushMail(pool, {
        limit: 1,
        fetcher: async () => ({ ok: false, status: 503 }),
    });
    assert.equal(failing.sent, 0);
    const pending = (
        await pool.query(
            "SELECT * FROM hub_email_outbox WHERE state='pending' ORDER BY created_at LIMIT 1",
        )
    ).rows[0];
    assert.equal(pending.last_error, 'PROVIDER_HTTP_503');
    await pool.query('UPDATE hub_email_outbox SET available_at=now()');
    const sent = await flushMail(pool, {
        limit: 10,
        fetcher: async (url, options) => {
            calls++;
            assert.match(options.headers['Idempotency-Key'], /^ochilink\//);
            assert.ok(JSON.parse(options.body).to.length);
            return { ok: true, json: async () => ({ id: 'email_' + calls }) };
        },
    });
    assert.ok(sent.sent > 0);
    assert.equal(
        (
            await pool.query(
                "SELECT count(*)::int AS count FROM hub_email_outbox WHERE state='sent' AND payload_encrypted<>''",
            )
        ).rows[0].count,
        0,
    );
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
});
test('recovery is generic, token is hashed, reset is single-use and revokes sessions', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.MAIL_FROM = 'verified@example.test';
    // Queue only; mock provider prevents real delivery.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ id: 'mock_reset' }),
    });
    try {
        const known = await request(
            'recovery',
            'POST',
            { email: 'owner@example.test' },
            '',
        );
        const unknown = await request(
            'recovery',
            'POST',
            { email: 'unknown@example.test' },
            '',
        );
        assert.deepEqual(known.body, unknown.body);
    } finally {
        globalThis.fetch = originalFetch;
        delete process.env.RESEND_API_KEY;
        delete process.env.MAIL_FROM;
    }
    // The provider payload was cleared after sending; create a known hashed token for reset consumption.
    const token = 'c'.repeat(64);
    await pool.query(
        "INSERT INTO hub_password_resets(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 minutes')",
        [digest(token), adminId],
    );
    const reset = await request(
        'reset-password',
        'POST',
        { token, password: password + '-new' },
        '',
    );
    assert.equal(reset.status, 200);
    assert.equal(
        (
            await request(
                'reset-password',
                'POST',
                { token, password: password + '-new' },
                '',
            )
        ).status,
        400,
    );
    assert.equal((await request('admin')).status, 401);
    cookie = (
        await request(
            'login',
            'POST',
            { email: 'owner@example.test', password: password + '-new' },
            '',
        )
    ).headers['Set-Cookie'].split(';')[0];
});
test('MFA setup requires password and verified TOTP; login needs MFA and rejects replay', async () => {
    assert.equal(
        (await request('mfa', 'POST', { action: 'setup', password: 'wrong' }))
            .status,
        400,
    );
    const setup = await request('mfa', 'POST', {
        action: 'setup',
        password: password + '-new',
    });
    assert.equal(setup.status, 200);
    assert.ok(
        !(
            await pool.query('SELECT mfa_pending_secret FROM users')
        ).rows[0].mfa_pending_secret.includes(setup.body.secret),
    );
    const step = Math.floor(Date.now() / 30000),
        code = totp(setup.body.secret, step);
    const enabled = await request('mfa', 'POST', {
        action: 'enable',
        password: password + '-new',
        code,
    });
    assert.equal(enabled.status, 200);
    mfaCodes = enabled.body.recovery_codes;
    assert.equal(mfaCodes.length, 8);
    const partial = await request(
        'login',
        'POST',
        { email: 'owner@example.test', password: password + '-new' },
        '',
    );
    assert.equal(partial.body.mfa_required, true);
    assert.equal(partial.headers['Set-Cookie'], undefined);
    assert.equal(
        (
            await request(
                'login',
                'POST',
                {
                    email: 'owner@example.test',
                    password: password + '-new',
                    otp: code,
                },
                '',
            )
        ).status,
        401,
    );
    const login = await request(
        'login',
        'POST',
        {
            email: 'owner@example.test',
            password: password + '-new',
            otp: mfaCodes[0],
        },
        '',
    );
    assert.equal(login.status, 200);
    assert.equal(
        (
            await request(
                'login',
                'POST',
                {
                    email: 'owner@example.test',
                    password: password + '-new',
                    otp: mfaCodes[0],
                },
                '',
            )
        ).status,
        401,
    );
    cookie = login.headers['Set-Cookie'].split(';')[0];
    assert.equal((await request('mfa')).body.recovery_codes_remaining, 7);
});
test('MFA disable needs password and a fresh recovery/authenticator code', async () => {
    assert.equal(
        (
            await request('mfa', 'POST', {
                action: 'disable',
                password: password + '-new',
                code: '000000',
            })
        ).status,
        400,
    );
    assert.equal(
        (
            await request('mfa', 'POST', {
                action: 'disable',
                password: password + '-new',
                code: mfaCodes[1],
            })
        ).status,
        200,
    );
    assert.equal((await request('mfa')).body.enabled, false);
});
let paymentSession;
const stripeMock = {
    checkout: {
        sessions: {
            async create(params, options) {
                assert.equal(
                    params.line_items[0].price_data.unit_amount,
                    15000,
                );
                assert.ok(options.idempotencyKey);
                return (paymentSession = {
                    id: 'cs_test_123',
                    url: 'https://checkout.stripe.com/test',
                    status: 'open',
                });
            },
            async retrieve() {
                return paymentSession;
            },
            async expire() {
                paymentSession.status = 'expired';
            },
        },
    },
};
test('checkout uses server quote and reuses a stable checkout session', async () => {
    const token = 'd'.repeat(64);
    await pool.query(
        "UPDATE consultations SET manage_token_hash=$1,manage_token_until=now()+interval '1 day' WHERE id=$2",
        [digest(token), consultationId],
    );
    const first = await tx((client) => checkout(client, token, stripeMock)),
        second = await tx((client) => checkout(client, token, stripeMock));
    assert.equal(first.url, second.url);
    assert.equal(
        (await pool.query('SELECT count(*)::int AS count FROM hub_payments'))
            .rows[0].count,
        1,
    );
    assert.equal(
        (
            await request(
                'payment-details',
                'POST',
                { token: 'e'.repeat(64) },
                '',
            )
        ).status,
        404,
    );
});
test('verified payment event updates paid state exactly once and mismatches rollback', async () => {
    const event = {
        id: 'evt_paid',
        type: 'checkout.session.completed',
        data: {
            object: {
                id: 'cs_test_123',
                payment_status: 'paid',
                amount_total: 15000,
                currency: 'usd',
                payment_intent: 'pi_test_123',
            },
        },
    };
    await tx((client) => processPaymentEvent(client, event));
    await tx((client) => processPaymentEvent(client, event));
    assert.equal(
        (
            await pool.query(
                'SELECT payment_status FROM consultations WHERE id=$1',
                [consultationId],
            )
        ).rows[0].payment_status,
        'Paid',
    );
    assert.equal(
        (
            await pool.query(
                "SELECT count(*)::int AS count FROM security_auth_logs WHERE event_type='PAYMENT_RECEIVED'",
            )
        ).rows[0].count,
        1,
    );
    await assert.rejects(
        tx((client) =>
            processPaymentEvent(client, {
                ...event,
                id: 'evt_bad',
                data: { object: { ...event.data.object, amount_total: 100 } },
            }),
        ),
        /PAYMENT_RECORD_MISMATCH/,
    );
    assert.equal(
        (
            await pool.query(
                "SELECT count(*)::int AS count FROM hub_payment_events WHERE event_id='evt_bad'",
            )
        ).rows[0].count,
        0,
    );
});
test('full verified refunds synchronize the consultation payment status', async () => {
    await tx((client) =>
        processPaymentEvent(client, {
            id: 'evt_refund',
            type: 'charge.refunded',
            data: {
                object: {
                    payment_intent: 'pi_test_123',
                    amount: 15000,
                    amount_refunded: 15000,
                    currency: 'usd',
                },
            },
        }),
    );
    assert.equal(
        (
            await pool.query(
                'SELECT payment_status FROM consultations WHERE id=$1',
                [consultationId],
            )
        ).rows[0].payment_status,
        'Refunded',
    );
});
test('webhook verifies raw-body signatures and rejects tampered payloads', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const stripe = new Stripe('sk_test_mock'),
        handle = createWebhookHandler(
            () => pool,
            () => stripe,
        );
    const payload = JSON.stringify({
        id: 'evt_verified',
        type: 'unhandled.test',
        data: { object: {} },
    });
    async function deliver(signature) {
        const req = Readable.from([Buffer.from(payload)]);
        req.method = 'POST';
        req.headers = { 'stripe-signature': signature };
        const result = { status: 200 };
        const res = {
            setHeader() {},
            status(n) {
                result.status = n;
                return res;
            },
            json(body) {
                result.body = body;
                return res;
            },
            end() {},
        };
        await handle(req, res);
        return result;
    }
    const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: 'whsec_test',
    });
    assert.equal((await deliver(signature)).status, 200);
    assert.equal((await deliver('invalid')).status, 400);
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
});

test('expired reset tokens and unauthorized feature access are rejected', async () => {
    const token = 'f'.repeat(64);
    await pool.query(
        "INSERT INTO hub_password_resets(token_hash,user_id,expires_at) VALUES ($1,$2,now()-interval '1 minute')",
        [digest(token), adminId],
    );
    assert.equal(
        (
            await request(
                'reset-password',
                'POST',
                { token, password: password + '-again' },
                '',
            )
        ).status,
        400,
    );
    for (const resource of [
        'analytics-admin',
        'mfa',
        'email-outbox',
        'availability-admin',
    ])
        assert.equal((await request(resource, 'GET', {}, '')).status, 401);
});
test('payment confirmation can reconcile a signed event after a lost checkout response', async () => {
    const id = (
        await pool.query(
            "INSERT INTO consultations(client_name,client_email,amount,manage_token_hash,manage_token_until) VALUES ('Network test','client@example.test',150,$1,now()+interval '1 day') RETURNING id",
            [digest('1'.repeat(64))],
        )
    ).rows[0].id;
    const prepared = await tx((client) =>
        prepareCheckout(client, '1'.repeat(64)),
    );
    assert.equal(prepared.payment.session_id, null);
    await tx((client) =>
        processPaymentEvent(client, {
            id: 'evt_reconciled',
            type: 'checkout.session.completed',
            data: {
                object: {
                    id: 'cs_reconciled',
                    payment_status: 'paid',
                    amount_total: 15000,
                    currency: 'usd',
                    payment_intent: 'pi_reconciled',
                    metadata: { payment_id: prepared.payment.id },
                },
            },
        }),
    );
    assert.equal(
        (
            await pool.query(
                'SELECT payment_status FROM consultations WHERE id=$1',
                [id],
            )
        ).rows[0].payment_status,
        'Paid',
    );
    assert.equal(
        (
            await pool.query(
                'SELECT session_id FROM hub_payments WHERE id=$1',
                [prepared.payment.id],
            )
        ).rows[0].session_id,
        'cs_reconciled',
    );
});
