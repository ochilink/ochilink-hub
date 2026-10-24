import Stripe from 'stripe';
import { canonicalOrigin, digest, encryptionReady, seal, secretToken } from './security.js';
import { queueMail } from './mail.js';
import { ensureCustomerForApplication } from './customer.js';

function fail(status, message) {
    throw Object.assign(new Error(message), { status });
}
export function rentalFeeAmounts(row) {
    const application = Number(row.application_fee_cents);
    const percent = Number(row.processing_percent);
    const fixed = Number(row.processing_fixed_cents);
    const processing = Math.round(application * percent / 100 + fixed);
    return { application, processing, total: application + processing, percent, fixed };
}
export async function getRentalFees(pool) {
    const row = (await pool.query('SELECT * FROM rental_fee_config WHERE id=1')).rows[0];
    if (!row) fail(503, 'Rental fee configuration is unavailable.');
    const f = rentalFeeAmounts(row);
    return {
        application_fee_cents: f.application,
        processing_fee_cents: f.processing,
        total_cents: f.total,
        processing_percent: f.percent,
        processing_fixed_cents: f.fixed,
        currency: 'usd',
    };
}
function clean(value, max = 500) {
    return String(value ?? '').trim().slice(0, max);
}
function validateApplication(data) {
    if (!data || typeof data !== 'object') fail(400, 'Application data is required.');
    const personal = data.personal || {};
    const property = data.property || {};
    const employment = data.employment || {};
    const emergency = data.emergency || {};
    const payment = data.payment || {};
    const name = clean(personal.fullName, 160);
    const email = clean(personal.email, 254).toLowerCase();
    const phone = clean(personal.phone, 80);
    const address = clean(property.address, 500);
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !phone || !address)
        fail(400, 'Complete the required applicant and property fields.');
    if (!clean(employment.employer, 200) || !clean(employment.income, 100))
        fail(400, 'Complete the required employment fields.');
    if (!clean(emergency.name, 160) || !clean(emergency.phone, 80))
        fail(400, 'Complete the emergency contact.');
    if (!payment.agree || clean(payment.signature, 160).length < 3)
        fail(400, 'Authorization and signature are required.');
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized, 'utf8') > 200000)
        fail(413, 'Application data is too large.');
    return { name, email, phone, address, serialized };
}
export async function createRentalCheckout(pool, body, stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null) {
    if (!encryptionReady()) fail(503, 'Application encryption is not configured.');
    if (!stripe) fail(503, 'Stripe is not configured.');
    const v = validateApplication(body?.rentalData);
    const fees = await getRentalFees(pool);
    const accessToken = secretToken();
    const client = await pool.connect();
    let application;
    try {
        await client.query('BEGIN');
        application = (await client.query(
            `INSERT INTO rental_applications
            (applicant_email,applicant_name,applicant_phone,property_address,data_encrypted,
             application_fee_cents,processing_fee_cents,total_cents,currency,access_token_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING id,created_at`,
            [v.email,v.name,v.phone,v.address,seal(v.serialized),fees.application_fee_cents,
             fees.processing_fee_cents,fees.total_cents,fees.currency,digest(accessToken)],
        )).rows[0];
        await client.query(
            `INSERT INTO security_auth_logs(event_type,user_identity,metadata)
             VALUES ('RENTAL_APPLICATION_CREATED',$1,$2)`,
            [v.email,{ application_id: application.id }],
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    const origin = canonicalOrigin();
    let session;
    try {
        session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: v.email,
            client_reference_id: application.id,
            metadata: {
                rental_application_id: application.id,
                rental_payment: '1',
            },
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: fees.currency,
                    unit_amount: fees.total_cents,
                    product_data: {
                        name: 'Ochilink rental application fee',
                        description: 'Residential rental application and processing',
                    },
                },
            }],
            success_url: `${origin}/rental-application/?payment=returned&application_id=${application.id}&access_token=${accessToken}`,
            cancel_url: `${origin}/rental-application/?payment=cancelled&application_id=${application.id}&access_token=${accessToken}`,
            payment_intent_data: {
                metadata: { rental_application_id: application.id },
            },
        }, { idempotencyKey: `ochilink-rental-${application.id}` });
    } catch (error) {
        await pool.query(
            `UPDATE rental_applications SET status='payment_expired',updated_at=now() WHERE id=$1 AND status='pending_payment'`,
            [application.id],
        );
        throw error;
    }
    await pool.query(
        'UPDATE rental_applications SET stripe_session_id=$1,updated_at=now() WHERE id=$2',
        [session.id, application.id],
    );
    return { url: session.url, application_id: application.id, access_token: accessToken, fees };
}
export async function rentalApplicationStatus(pool, id, accessToken) {
    if (!id || !accessToken) fail(400, 'Application access information is required.');
    const row = (await pool.query(
        `SELECT id,applicant_email,applicant_name,property_address,status,payment_status,
                application_fee_cents,processing_fee_cents,total_cents,currency,
                submitted_at,created_at
         FROM rental_applications WHERE id=$1 AND access_token_hash=$2
         AND access_token_expires_at>now() AND access_token_used_at IS NULL`,
        [id, digest(accessToken)],
    )).rows[0];
    if (!row) fail(404, 'Application not found.');
    return row;
}
export async function processRentalPaymentEvent(client, event) {
    const object = event.data.object;
    const id = object.metadata?.rental_application_id;
    if (!id) return false;
    if (['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type)) {
        await client.query(
            `UPDATE rental_applications SET status='payment_expired',updated_at=now()
             WHERE id=$1 AND stripe_session_id=$2 AND payment_status='unpaid'`,
            [id, object.id],
        );
        await client.query(
            `INSERT INTO security_auth_logs(event_type,metadata)
             VALUES ('RENTAL_PAYMENT_EXPIRED',$1)`,
            [{ application_id: id }],
        );
        return true;
    }
    if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
        if (object.payment_status !== 'paid') return true;
        const app = (await client.query(
            'SELECT * FROM rental_applications WHERE id=$1 FOR UPDATE',
            [id],
        )).rows[0];
        if (!app || (app.stripe_session_id && app.stripe_session_id !== object.id) ||
            Number(app.total_cents) !== Number(object.amount_total) ||
            app.currency !== object.currency)
            throw new Error('RENTAL_PAYMENT_RECORD_MISMATCH');
        if (app.payment_status === 'paid') return true;
        const intent = typeof object.payment_intent === 'string'
            ? object.payment_intent : object.payment_intent?.id || null;
        await client.query(
            `UPDATE rental_applications SET status='submitted',payment_status='paid',
             stripe_session_id=$1,stripe_payment_intent=$2,paid_at=now(),submitted_at=now(),updated_at=now()
             WHERE id=$3`,
            [object.id,intent,id],
        );
        const customer = await ensureCustomerForApplication(client, app);
        await client.query(
            `INSERT INTO security_auth_logs(event_type,user_identity,metadata)
             VALUES ('RENTAL_APPLICATION_SUBMITTED',$1,$2)`,
            [app.applicant_email,{ application_id: id }],
        );
        if (encryptionReady()) {
            const amount = (Number(app.total_cents)/100).toFixed(2);
            await queueMail(
                client,
                'rental-application',
                app.applicant_email,
                'Ochilink rental application received',
                `Your rental application was received and payment of USD ${amount} was verified. Application reference: ${id}. Visit ${canonicalOrigin()}/account/ to access your Ochilink account, applications, and private documents.`,
                `rental-application/${id}`,
            );
        }
        return true;
    }
    return true;
}
