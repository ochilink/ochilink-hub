import Stripe from 'stripe';
import { createHash } from 'node:crypto';
import { encryptionReady } from './security.js';
import { canonicalOrigin, digest } from './security.js';
import { queueMail } from './mail.js';
const formatBookingDate = (value) =>
    new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    }).format(new Date(value));
export const stripeReady = () =>
    !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
export const stripeClient = () =>
    new Stripe(process.env.STRIPE_SECRET_KEY, {
        maxNetworkRetries: 1,
        timeout: 10000,
    });
export async function prepareCheckout(client, token) {
    const row = (
        await client.query(
            `SELECT * FROM consultations WHERE manage_token_hash=$1 AND manage_token_until>now() FOR UPDATE`,
            [digest(token)],
        )
    ).rows[0];
    if (!row || row.status === 'Cancelled')
        throw Object.assign(
            new Error('Payment link is unavailable or expired.'),
            { status: 404 },
        );
    if (
        row.payment_status !== 'Unpaid' ||
        !row.amount ||
        Number(row.amount) <= 0
    )
        throw Object.assign(
            new Error('This consultation has no outstanding payable amount.'),
            { status: 409 },
        );
    let payment = (
        await client.query(
            `INSERT INTO hub_payments(consultation_id,version,amount_cents,currency)
        VALUES ($1,$2,$3,$4) ON CONFLICT (consultation_id,version) DO UPDATE SET version=EXCLUDED.version RETURNING *`,
            [
                row.id,
                row.payment_version,
                Math.round(Number(row.amount) * 100),
                row.currency.toLowerCase(),
            ],
        )
    ).rows[0];
    return { row, payment };
}
export async function checkout(client, token, stripe = stripeClient()) {
    const { row, payment } = await prepareCheckout(client, token);
    if (payment.state !== 'pending')
        throw Object.assign(
            new Error('This payment link is no longer active.'),
            { status: 409 },
        );
    if (payment.session_id) {
        const existing = await stripe.checkout.sessions.retrieve(
            payment.session_id,
        );
        if (existing.status === 'open') return { url: existing.url };
        throw Object.assign(
            new Error(
                'This checkout has finished or expired. Contact Ochilink for a new link.',
            ),
            { status: 409 },
        );
    }
    if (Date.now() - new Date(payment.created_at).getTime() > 23 * 3600000)
        throw Object.assign(
            new Error('Checkout setup expired. Request a new payment link.'),
            { status: 409 },
        );
    const origin = canonicalOrigin();
    const session = await stripe.checkout.sessions.create(
        {
            mode: 'payment',
            integration_identifier: `ochilink_consultation_${createHash('sha256').update(payment.id).digest().subarray(0,8).reduce((s, b) => s + String.fromCharCode(97 + b % 26), '')}`,
            ...(row.checkout_required ? { expires_at: Math.floor(new Date(payment.created_at).getTime()/1000) + 35*60 } : {}),
            customer_email: row.client_email,
            client_reference_id: row.id,
            metadata: { consultation_id: row.id, payment_id: payment.id },
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: payment.currency,
                        unit_amount: payment.amount_cents,
                        product_data: {
                            name: 'Ochilink consultation',
                            description: 'Consultation services',
                        },
                    },
                },
            ],
            success_url: row.checkout_required ? `${origin}/booking?payment=returned` : `${origin}/?payment=returned`,
            cancel_url: row.checkout_required ? `${origin}/booking?payment=cancelled` : `${origin}/?payment=cancelled`,
            payment_intent_data: {
                metadata: { consultation_id: row.id, payment_id: payment.id },
            },
        },
        {
            idempotencyKey: `ochilink-consultation-${row.id}-${row.payment_version}`,
        },
    );
    await client.query(
        'UPDATE hub_payments SET session_id=$1,checkout_url=$2 WHERE id=$3',
        [session.id, session.url, payment.id],
    );
    return { url: session.url };
}
export async function invalidateCheckout(
    client,
    consultationId,
    stripe = stripeReady() ? stripeClient() : null,
) {
    const pending = (
        await client.query(
            "SELECT * FROM hub_payments WHERE consultation_id=$1 AND state='pending' FOR UPDATE",
            [consultationId],
        )
    ).rows;
    for (const payment of pending) {
        if (!payment.session_id && (await client.query('SELECT checkout_required FROM consultations WHERE id=$1', [consultationId])).rows[0]?.checkout_required)
            throw Object.assign(new Error('Checkout outcome is not known yet. Resolve the Stripe session before cancelling this hold.'), { status: 409 });
        if (payment.session_id) {
            if (!stripe)
                throw Object.assign(
                    new Error(
                        'Stripe must be configured to update an active checkout.',
                    ),
                    { status: 503 },
                );
            const session = await stripe.checkout.sessions.retrieve(
                payment.session_id,
            );
            if (session.status === 'complete')
                throw Object.assign(
                    new Error(
                        'Payment has completed. Refresh before changing this consultation.',
                    ),
                    { status: 409 },
                );
            if (session.status === 'open')
                await stripe.checkout.sessions.expire(payment.session_id);
        }
        await client.query(
            "UPDATE hub_payments SET state='expired' WHERE id=$1",
            [payment.id],
        );
    }
}
export async function processPaymentEvent(client, event, stripe = null) {
    if (
        !(
            await client.query(
                'INSERT INTO hub_payment_events(event_id,event_type) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING event_id',
                [event.id, event.type],
            )
        ).rows.length
    )
        return;
    const object = event.data.object;
    // Smoke tests never touch consultation or hub_payments records.
    const smokeId = object.metadata?.ochilink_smoke_test_id;
    if (smokeId && [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
    ].includes(event.type)) {
        const outcome = event.type === 'checkout.session.expired' ? 'expired'
            : event.type === 'checkout.session.async_payment_failed' ? 'failed'
            : object.payment_status === 'paid' ? 'paid' : null;
        const found = (await client.query(
            'SELECT id,amount_cents,currency,state FROM hub_live_smoke_tests WHERE id=$1 AND stripe_session_id=$2 FOR UPDATE',
            [smokeId, object.id],
        )).rows[0];
        if (!found || found.amount_cents !== 100 || found.currency !== 'usd' ||
            object.amount_total !== 100 || object.currency !== 'usd')
            throw new Error('SMOKE_PAYMENT_MISMATCH');
        if (outcome && found.state === 'checkout_open') {
            await client.query(
                `UPDATE hub_live_smoke_tests SET state=$2,stripe_payment_intent=$3,updated_at=now() WHERE id=$1`,
                [smokeId, outcome, typeof object.payment_intent === 'string'
                    ? object.payment_intent : object.payment_intent?.id || null],
            );
            await client.query(
                `INSERT INTO security_auth_logs(event_type,metadata) VALUES ('LIVE_SMOKE_EVENT_PROCESSED',$1)`,
                [{ smoke_test_id: smokeId, outcome }],
            );
        }
        return;
    }
    if (event.type === 'charge.refunded' && stripe && object.payment_intent) {
        const smoke = (await client.query(
            'SELECT id,amount_cents,currency,state FROM hub_live_smoke_tests WHERE stripe_payment_intent=$1 FOR UPDATE',
            [object.payment_intent],
        )).rows[0];
        if (smoke) {
            if (object.currency !== 'usd' || object.amount !== 100)
                throw new Error('SMOKE_REFUND_MISMATCH');
            if (object.amount_refunded >= 100 && smoke.state !== 'refunded') {
                await client.query(
                    `UPDATE hub_live_smoke_tests SET state='refunded',updated_at=now() WHERE id=$1`,
                    [smoke.id],
                );
                await client.query(
                    `INSERT INTO security_auth_logs(event_type,metadata) VALUES ('LIVE_SMOKE_REFUNDED',$1)`,
                    [{ smoke_test_id: smoke.id }],
                );
            }
            return;
        }
    }
    if (['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(event.type)) {
        const match = (await client.query('SELECT id,consultation_id FROM hub_payments WHERE session_id=$1 OR (id=$2::uuid AND session_id IS NULL)', [object.id, object.metadata?.payment_id || null])).rows[0];
        if (!match) throw new Error('PAYMENT_RECORD_MISMATCH');
        await client.query('SELECT id FROM consultations WHERE id=$1 FOR UPDATE', [match.consultation_id]);
        await client.query("UPDATE hub_payments SET state='expired',session_id=$2 WHERE id=$1 AND state='pending'", [match.id, object.id]);
        await client.query(`UPDATE consultations SET status='Cancelled',reserved_until=NULL,updated_at=now()
            WHERE id=$1 AND checkout_required AND status='Requested' AND payment_status='Unpaid'
            AND NOT EXISTS (SELECT 1 FROM hub_payments WHERE consultation_id=$1 AND state IN ('pending','paid'))`, [match.consultation_id]);
    }
    if (
        [
            'checkout.session.completed',
            'checkout.session.async_payment_succeeded',
        ].includes(event.type)
    ) {
        if (object.payment_status !== 'paid') return;
        let lookup = (
            await client.query(
                'SELECT consultation_id,id FROM hub_payments WHERE session_id=$1',
                [object.id],
            )
        ).rows[0];
        if (!lookup && object.metadata?.payment_id)
            lookup = (
                await client.query(
                    'SELECT consultation_id,id FROM hub_payments WHERE id=$1',
                    [object.metadata.payment_id],
                )
            ).rows[0];
        if (!lookup) throw new Error('PAYMENT_RECORD_MISMATCH');
        const consultation = (
            await client.query(
                'SELECT * FROM consultations WHERE id=$1 FOR UPDATE',
                [lookup.consultation_id],
            )
        ).rows[0];
        const payment = (
            await client.query(
                'SELECT * FROM hub_payments WHERE id=$1 FOR UPDATE',
                [lookup.id],
            )
        ).rows[0];
        if (
            !payment ||
            (payment.session_id && payment.session_id !== object.id) ||
            payment.amount_cents !== object.amount_total ||
            payment.currency !== object.currency
        )
            throw new Error('PAYMENT_RECORD_MISMATCH');
        if (payment.state === 'paid' || payment.state === 'refunded') return;
        await client.query(
            "UPDATE hub_payments SET state='paid',paid_at=now(),payment_intent=$1,session_id=$3 WHERE id=$2",
            [
                typeof object.payment_intent === 'string'
                    ? object.payment_intent
                    : object.payment_intent?.id,
                payment.id,
                object.id,
            ],
        );
        const confirm = consultation.checkout_required && consultation.status === 'Requested'
            && consultation.payment_version === payment.version && payment.state === 'pending';
        await client.query(
            "UPDATE consultations SET payment_status='Paid',status=CASE WHEN $2 THEN 'Scheduled' ELSE status END,reserved_until=CASE WHEN $2 THEN NULL ELSE reserved_until END,updated_at=now() WHERE id=$1",
            [payment.consultation_id, confirm],
        );
        await client.query(
            'INSERT INTO security_auth_logs(event_type,metadata) VALUES ($1,$2)',
            [
                consultation.status === 'Cancelled' ||
                consultation.payment_version !== payment.version
                    ? 'PAYMENT_REQUIRES_REVIEW'
                    : 'PAYMENT_RECEIVED',
                { consultation_id: payment.consultation_id },
            ],
        );
        if (encryptionReady()) await queueMail(
            client,
            'payment',
            consultation.client_email,
            confirm ? 'Your Ochilink booking is confirmed' : 'Ochilink payment received',
            `${confirm ? 'Booking confirmed for ' + formatBookingDate(consultation.scheduled_at) + '. Duration: ' + consultation.duration_minutes + ' minutes. ' : ''}We received your ${payment.currency.toUpperCase()} ${(payment.amount_cents / 100).toFixed(2)} payment. Reference: ${consultation.id}.`,
            `payment/${payment.id}`,
        );
        if (confirm && encryptionReady() && process.env.NOTIFICATION_EMAIL) {
            await queueMail(client, 'admin-notification', process.env.NOTIFICATION_EMAIL,
                'Paid Ochilink booking confirmed',
                `Booking ${consultation.id} is confirmed for ${formatBookingDate(consultation.scheduled_at)}. Duration: ${consultation.duration_minutes} minutes. View client details in Admin.`,
                `booking-admin/${payment.id}`);
        }
    }
    if (event.type === 'charge.refunded') {
        let lookup = (
            await client.query(
                'SELECT * FROM hub_payments WHERE payment_intent=$1',
                [object.payment_intent],
            )
        ).rows[0];
        if (!lookup && stripe) {
            const intent = await stripe.paymentIntents.retrieve(
                object.payment_intent,
            );
            if (!intent.metadata?.payment_id) return;
            lookup = (
                await client.query('SELECT * FROM hub_payments WHERE id=$1', [
                    intent.metadata.payment_id,
                ])
            ).rows[0];
        }
        if (!lookup) throw new Error('REFUND_RECORD_NOT_READY');
        await client.query(
            'SELECT id FROM consultations WHERE id=$1 FOR UPDATE',
            [lookup.consultation_id],
        );
        const payment = (
            await client.query(
                'SELECT * FROM hub_payments WHERE id=$1 FOR UPDATE',
                [lookup.id],
            )
        ).rows[0];
        if (
            object.currency !== payment.currency ||
            object.amount !== payment.amount_cents
        )
            throw new Error('REFUND_RECORD_MISMATCH');
        await client.query(
            'UPDATE hub_payments SET payment_intent=$1 WHERE id=$2',
            [object.payment_intent, payment.id],
        );
        await client.query(
            "UPDATE hub_payments SET refunded_cents=GREATEST(refunded_cents,$1),state=CASE WHEN $1>=amount_cents THEN 'refunded' ELSE state END WHERE id=$2",
            [object.amount_refunded, payment.id],
        );
        if (object.amount_refunded >= payment.amount_cents)
            await client.query(
                "UPDATE consultations SET payment_status='Refunded',updated_at=now() WHERE id=$1",
                [payment.consultation_id],
            );
        await client.query(
            "INSERT INTO security_auth_logs(event_type,metadata) VALUES ('PAYMENT_REFUNDED',$1)",
            [{ consultation_id: payment.consultation_id }],
        );
    }
}

// Reconcile delayed/missed webhooks before publishing availability. Unknown
// Stripe outcomes retain the hold rather than risking a second paid booking.
export async function reconcileBookingPayments(pool, stripe = stripeClient()) {
    const pending = (await pool.query(`SELECT p.session_id FROM hub_payments p
        JOIN consultations c ON c.id=p.consultation_id
        WHERE c.checkout_required AND p.state='pending' AND p.session_id IS NOT NULL
        AND p.created_at<now()-interval '35 minutes' ORDER BY p.created_at LIMIT 5`)).rows;
    for (const payment of pending) {
        const session = await stripe.checkout.sessions.retrieve(payment.session_id);
        const type = session.status === 'expired' ? 'checkout.session.expired'
            : session.payment_status === 'paid' ? 'checkout.session.completed' : null;
        if (!type) continue;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await processPaymentEvent(client, { id: `reconcile_${session.id}_${session.status}_${session.payment_status}`, type, data: { object: session } });
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    }
}
