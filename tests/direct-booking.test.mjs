import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../api/hub.js';
import { processPaymentEvent, reconcileBookingPayments } from '../lib/payments.js';
import { availableSlots } from '../lib/scheduling.js';
import { unseal } from '../lib/security.js';
import { flushMail } from '../lib/mail.js';
const db = new PGlite();
const pool = { query: (sql, values) => db.query(sql, values), async connect() { return { query: pool.query, release() {} }; } };
let slot, calls = 0, params, idempotency, failOnce = false;
const sessions = new Map();
const stripe = { checkout: { sessions: {
    async create(input, options) {
        calls++;
        params = input;
        if (idempotency) assert.equal(options.idempotencyKey, idempotency);
        idempotency = options.idempotencyKey;
        if (failOnce) { failOnce = false; throw new Error('NETWORK_TIMEOUT'); }
        const session = { id: `cs_test_${calls}`, url: 'https://checkout.stripe.com/c/pay/test', status: 'open', payment_status: 'unpaid', amount_total: input.line_items[0].price_data.unit_amount, currency: 'usd', metadata: input.metadata };
        sessions.set(session.id, session);
        return session;
    },
    async retrieve(id) { return sessions.get(id); },
} } };
const handler = createHandler(() => pool, () => stripe);
async function request(body) {
    const output = { status: 200 };
    const res = { setHeader() {}, status(code) { output.status=code; return res; }, json(body) { output.body=body; return res; } };
    await handler({ method:'POST', query:{resource:'consultations'}, body, headers:{host:'hub.test',origin:'https://hub.test','content-type':'application/json','x-forwarded-for':'127.0.0.1'} },res);
    return output;
}
async function event(type, session, id = type) {
    await db.exec('BEGIN');
    try { await processPaymentEvent(pool, {id, type, data:{object:session}}); await db.exec('COMMIT'); }
    catch(error) { await db.exec('ROLLBACK'); throw error; }
}
const body = () => ({client_name:'Booking Client',client_email:'client@example.test',service:'Website Audit',slot_id:slot,booking:true,booking_token:'b'.repeat(64),duration_minutes:60,amount:1});
before(async () => {
    process.env.PUBLIC_SITE_URL='https://hub.test';
    process.env.RATE_LIMIT_SECRET='private-testing-rate-secret-32-characters';
    process.env.APP_ENCRYPTION_KEY='ab'.repeat(32);
    process.env.STRIPE_SECRET_KEY='sk_test_private_fixture';
    process.env.STRIPE_WEBHOOK_SECRET='whsec_private_fixture';
    process.env.NOTIFICATION_EMAIL='owner@example.test';
    delete process.env.RESEND_API_KEY;
    for (const name of ['001_ochilink_hub','003_complete_hub','004_direct_booking','004_direct_booking']) await db.exec(await readFile(`database/migrations/${name}.sql`,'utf8'));
    slot=(await pool.query("INSERT INTO hub_availability(starts_at,ends_at) VALUES(now()+interval '2 days',now()+interval '2 days 3 hours') RETURNING id")).rows[0].id;
});
after(() => db.close());
test('booking rejects incomplete payment configuration without saving a request',async()=>{
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal((await request(body())).status,503);
    assert.equal((await pool.query('SELECT id FROM consultations')).rows.length,0);
    process.env.STRIPE_WEBHOOK_SECRET='whsec_private_fixture';
});
test('checkout retries a timeout using the persisted hold and server price',async()=>{
    failOnce=true;
    assert.equal((await request(body())).status,500);
    assert.equal((await pool.query('SELECT id FROM consultations')).rows.length,1);
    const result=await request(body());
    assert.equal(result.status,201);
    assert.match(result.body.checkout_url,/checkout.stripe.com/);
    assert.equal(params.line_items[0].price_data.unit_amount,15000);
    assert.equal(params.success_url,'https://hub.test/booking?payment=returned');
    assert.equal(params.cancel_url,'https://hub.test/booking?payment=cancelled');
    assert.ok(params.expires_at>Date.now()/1000+30*60);
    assert.equal((await pool.query('SELECT * FROM consultations')).rows[0].status,'Requested');
    assert.equal((await pool.query('SELECT id FROM hub_email_outbox')).rows.length,0);
    const retry=await request(body());
    assert.equal(retry.body.checkout_url,result.body.checkout_url);
    assert.equal(calls,2);
    assert.equal((await pool.query('SELECT id FROM hub_payments')).rows.length,1);
});
test('a separate customer cannot take the held slot',async()=>{
    assert.equal((await request({...body(),booking_token:'c'.repeat(64)})).status,409);
    assert.equal((await availableSlots(pool)).length,0);
});
test('unpaid completion keeps a hold even after local timeout; paid webhook confirms once',async()=>{
    const session=[...sessions.values()][0];
    await pool.query("UPDATE consultations SET reserved_until=now()-interval '1 minute'");
    await event('checkout.session.completed',session,'evt_unpaid');
    assert.equal((await availableSlots(pool)).length,0);
    assert.equal((await pool.query('SELECT status FROM consultations')).rows[0].status,'Requested');
    const paid={...session,payment_status:'paid',payment_intent:'pi_test_booking'};
    await event('checkout.session.async_payment_succeeded',paid,'evt_paid_booking');
    await event('checkout.session.async_payment_succeeded',paid,'evt_paid_booking');
    await event('checkout.session.completed',paid,'evt_paid_duplicate_type');
    const row=(await pool.query('SELECT * FROM consultations')).rows[0];
    assert.equal(row.status,'Scheduled');
    assert.equal(row.payment_status,'Paid');
    assert.equal(row.reserved_until,null);
    const emails=(await pool.query('SELECT * FROM hub_email_outbox')).rows;
    assert.equal(emails.length,2);
    assert.match(unseal(emails.find(x=>x.kind==='payment').payload_encrypted),/booking is confirmed/);
    assert.equal((await availableSlots(pool)).length,0);
});
test('expired and failed checkouts release slots; missed expiry webhook is reconciled',async()=>{
    for(const type of ['checkout.session.expired','checkout.session.async_payment_failed']) {
        const id=(await pool.query("INSERT INTO consultations(client_name,client_email,checkout_required,slot_id,scheduled_at,reserved_until) VALUES('Expired','expired@example.test',true,$1,now()+interval '4 days',now()+interval '35 minutes') RETURNING id",[slot])).rows[0].id;
        const sid=`cs_${type}`;
        await pool.query("INSERT INTO hub_payments(consultation_id,version,amount_cents,session_id) VALUES($1,1,15000,$2)",[id,sid]);
        await event(type,{id:sid},`evt_${type}`);
        assert.equal((await pool.query('SELECT status FROM consultations WHERE id=$1',[id])).rows[0].status,'Cancelled');
    }
    const id=(await pool.query("INSERT INTO consultations(client_name,client_email,checkout_required) VALUES('Missed','missed@example.test',true) RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO hub_payments(consultation_id,version,amount_cents,session_id,created_at) VALUES($1,1,15000,'cs_missed',now()-interval '40 minutes')",[id]);
    sessions.set('cs_missed',{id:'cs_missed',status:'expired',payment_status:'unpaid'});
    await reconcileBookingPayments(pool,stripe);
    assert.equal((await pool.query('SELECT status FROM consultations WHERE id=$1',[id])).rows[0].status,'Cancelled');
});

test('email provider failure after payment commit preserves paid state and retries without duplicate confirmation', async () => {
    const payment = (await pool.query("SELECT id,consultation_id FROM hub_payments WHERE state='paid' ORDER BY created_at LIMIT 1")).rows[0];
    assert.ok(payment);
    const initial = (await pool.query("SELECT count(*)::int AS count FROM hub_email_outbox WHERE kind='payment'")).rows[0].count;
    assert.equal(initial, 1);
    const previous = { key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM };
    process.env.RESEND_API_KEY = 're_test_mock_only';
    process.env.MAIL_FROM = 'noreply@example.test';
    try {
        const failure = await flushMail(pool, {
            limit: 1,
            fetcher: async () => ({ ok: false, status: 503 }),
        });
        assert.equal(failure.sent, 0);
        const queued = (await pool.query("SELECT state,attempts FROM hub_email_outbox WHERE kind='payment'")).rows[0];
        assert.equal(queued.state, 'pending');
        assert.equal(queued.attempts, 1);
        const paidBefore = (await pool.query('SELECT state FROM hub_payments WHERE id=$1', [payment.id])).rows[0];
        assert.equal(paidBefore.state, 'paid');

        const paidSession = {
            id: [...sessions.values()][0].id,
            payment_status: 'paid',
            payment_intent: 'pi_test_booking',
        };
        await event('checkout.session.completed', paidSession, 'evt_paid_duplicate_type');
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM hub_email_outbox WHERE kind='payment'")).rows[0].count, initial);

        await pool.query("UPDATE hub_email_outbox SET available_at=now()-interval '1 minute' WHERE kind='payment'");
        const success = await flushMail(pool, {
            limit: 1,
            fetcher: async () => ({ ok: true, async json() { return { id: 'email_mock_delivered' }; } }),
        });
        assert.equal(success.sent, 1);
        const delivered = (await pool.query("SELECT state,provider_id FROM hub_email_outbox WHERE kind='payment'")).rows[0];
        assert.equal(delivered.state, 'sent');
        assert.equal(delivered.provider_id, 'email_mock_delivered');
        assert.equal((await pool.query('SELECT state FROM hub_payments WHERE id=$1', [payment.id])).rows[0].state, 'paid');
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM hub_email_outbox WHERE kind='payment'")).rows[0].count, initial);
    } finally {
        for (const [name, value] of Object.entries({ RESEND_API_KEY: previous.key, MAIL_FROM: previous.from })) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    }
});
