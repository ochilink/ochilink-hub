import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import {
    digest,
    secretToken,
    encryptionReady,
    seal,
    unseal,
    canonicalOrigin,
    newTotpSecret,
    totpStep,
    useMfa,
} from './security.js';
import { queueMail, flushMail, mailReady } from './mail.js';
import { availableSlots, reserveSlot, uuidPattern } from './scheduling.js';
import {
    stripeReady,
    reconcileBookingPayments,
    checkout,
    prepareCheckout,
    invalidateCheckout,
} from './payments.js';
export const capabilities = () => ({
    email: mailReady() && encryptionReady(),
    mfa: encryptionReady(),
    payments: stripeReady(),
    calendar: true,
});
const publicFeatures = [
    'recovery',
    'reset-password',
    'availability',
    'analytics',
    'payment-details',
    'checkout',
];
export async function featureRequest(context) {
    const {
        resource,
        req,
        res,
        body,
        pool,
        user,
        text,
        fail,
        transaction,
        audit,
        throttle,
    } = context;
    if (
        !publicFeatures.includes(resource) &&
        ![
            'mfa',
            'availability-admin',
            'consultation-admin',
            'payment-link',
            'email-outbox',
            'analytics-admin',
        ].includes(resource)
    )
        return false;
    const ip = String(
        req.headers['x-forwarded-for'] ||
            req.socket?.remoteAddress ||
            'unknown',
    )
        .split(',')[0]
        .trim();
    const authenticated = () => {
        if (!user || user.role !== 'admin')
            fail(401, 'Administrator sign-in required.');
    };
    if (resource === 'availability' && req.method === 'GET') {
        if (stripeReady()) await reconcileBookingPayments(pool);
        res.json({ slots: await availableSlots(pool), booked_slots: (await pool.query(`SELECT s.id,s.starts_at,s.ends_at,true AS is_booked FROM hub_availability s
            WHERE s.is_enabled AND s.starts_at>now() AND s.starts_at<now()+interval '90 days'
            AND EXISTS (SELECT 1 FROM consultations c WHERE c.scheduled_at<s.ends_at
            AND c.scheduled_at+(c.duration_minutes*interval '1 minute')>s.starts_at
            AND (c.status='Scheduled' OR (c.status='Requested' AND (c.reserved_until>now() OR (c.checkout_required AND EXISTS (SELECT 1 FROM hub_payments hp WHERE hp.consultation_id=c.id AND hp.state='pending'))))))
            ORDER BY s.starts_at LIMIT 300`)).rows });
        return true;
    }
    if (resource === 'recovery' && req.method === 'POST') {
        if (!capabilities().email)
            fail(503, 'Password recovery email is not configured yet.');
        const email = text(body.email, 254).toLowerCase();
        await throttle(pool, `reset-ip:${ip}`, 10);
        await throttle(pool, `reset-email:${email}`, 3);
        const account = (
            await pool.query(
                'SELECT id,email FROM users WHERE email=$1 AND is_active',
                [email],
            )
        ).rows[0];
        if (account)
            await transaction(pool, async (client) => {
                const token = secretToken();
                await client.query(
                    'SELECT id FROM users WHERE id=$1 FOR UPDATE',
                    [account.id],
                );
                await client.query(
                    'UPDATE hub_password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
                    [account.id],
                );
                await client.query(
                    "INSERT INTO hub_password_resets(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 minutes')",
                    [digest(token), account.id],
                );
                await queueMail(
                    client,
                    'password-reset',
                    account.email,
                    'Reset your Ochilink password',
                    `Reset your password within 30 minutes: ${canonicalOrigin()}/admin#reset=${token}\nIf you did not request this, ignore this email.`,
                    `reset/${digest(token)}`,
                );
                await audit(client, account.id, 'PASSWORD_RESET_REQUESTED');
            });
        await flushMail(pool, { limit: 2 });
        res.json({
            ok: true,
            message:
                'If this account exists, a password reset email has been queued.',
        });
        return true;
    }
    if (resource === 'reset-password' && req.method === 'POST') {
        await throttle(pool, `reset-consume:${ip}`, 10);
        if (!/^[a-f0-9]{64}$/.test(body.token || ''))
            fail(400, 'Invalid or expired reset link.');
        const password = typeof body.password === 'string' ? body.password : '';
        if (password.length < 14 || Buffer.byteLength(password) > 72)
            fail(400, 'Use 14+ characters and at most 72 UTF-8 bytes.');
        const hash = await bcrypt.hash(password, 12);
        await transaction(pool, async (client) => {
            const lookup = (
                await client.query(
                    'SELECT user_id FROM hub_password_resets WHERE token_hash=$1',
                    [digest(body.token)],
                )
            ).rows[0];
            if (!lookup) fail(400, 'Invalid or expired reset link.');
            await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
                lookup.user_id,
            ]);
            const token = (
                await client.query(
                    'SELECT * FROM hub_password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',
                    [digest(body.token)],
                )
            ).rows[0];
            if (!token) fail(400, 'Invalid or expired reset link.');
            await client.query(
                'UPDATE users SET password_hash=$1,failed_attempts=0,locked_until=NULL,updated_at=now() WHERE id=$2',
                [hash, token.user_id],
            );
            await client.query(
                'UPDATE hub_password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
                [token.user_id],
            );
            await client.query('DELETE FROM hub_sessions WHERE user_id=$1', [
                token.user_id,
            ]);
            await audit(client, token.user_id, 'PASSWORD_RESET_COMPLETED');
            const account = (
                await client.query('SELECT email FROM users WHERE id=$1', [
                    token.user_id,
                ])
            ).rows[0];
            await queueMail(
                client,
                'security',
                account.email,
                'Your Ochilink password changed',
                'Your password was changed. All existing sessions were signed out. MFA remains enabled if previously configured.',
                `password-changed/${digest(body.token)}`,
            );
        });
        await flushMail(pool, { limit: 2 });
        res.json({ ok: true });
        return true;
    }
    if (resource === 'analytics' && req.method === 'POST') {
        if (
            body.consent !== true ||
            req.headers.dnt === '1' ||
            req.headers['sec-gpc'] === '1'
        )
            fail(400, 'Analytics consent is required.');
        if (
            !uuidPattern.test(body.session || '') ||
            !['view', 'click', 'scroll'].includes(body.event_type)
        )
            fail(400, 'Invalid analytics event.');
        if (!['/', '/index.html'].includes(body.path))
            fail(400, 'This page is not tracked.');
        await throttle(pool, `analytics:${ip}`, 300);
        const sessionHash = digest(
            `${body.session}:${new Date().toISOString().slice(0, 10)}`,
        );
        const cell =
            body.event_type === 'click' &&
            Number.isInteger(body.cell) &&
            body.cell >= 0 &&
            body.cell <= 95
                ? body.cell
                : null;
        const depth =
            body.event_type === 'scroll' &&
            Number.isInteger(body.depth) &&
            body.depth >= 0 &&
            body.depth <= 100
                ? body.depth
                : null;
        const target = ['link', 'button', 'other'].includes(body.target)
            ? body.target
            : null;
        await pool.query(
            'INSERT INTO hub_analytics(session_hash,path,event_type,cell,target,depth) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
            [sessionHash, body.path, body.event_type, cell, target, depth],
        );
        res.json({ ok: true });
        return true;
    }
    if (
        ['payment-details', 'checkout'].includes(resource) &&
        req.method === 'POST'
    ) {
        await throttle(pool, `payment:${ip}`, 30);
        if (!/^[a-f0-9]{64}$/.test(body.token || ''))
            fail(404, 'Payment link unavailable.');
        if (resource === 'checkout') {
            if (!stripeReady()) fail(503, 'Payments are not configured yet.');
            await transaction(pool, (client) =>
                prepareCheckout(client, body.token),
            );
            res.json(
                await transaction(pool, (client) =>
                    checkout(client, body.token),
                ),
            );
            return true;
        }
        const row = (
            await pool.query(
                'SELECT amount,currency,payment_status,status FROM consultations WHERE manage_token_hash=$1 AND manage_token_until>now()',
                [digest(body.token)],
            )
        ).rows[0];
        if (!row) fail(404, 'Payment link unavailable or expired.');
        res.json({ ...row, configured: stripeReady() });
        return true;
    }
    authenticated();
    if (resource === 'mfa') {
        const keepHash = digest(
            (req.headers.cookie || '').match(
                /(?:^|;\s*)ochi_session=([a-f0-9]{64})(?:;|$)/,
            )?.[1] || '',
        );
        if (req.method === 'GET') {
            const row = (
                await pool.query(
                    'SELECT mfa_secret,mfa_recovery_hashes FROM users WHERE id=$1',
                    [user.id],
                )
            ).rows[0];
            res.json({
                enabled: !!row.mfa_secret,
                recovery_codes_remaining: row.mfa_recovery_hashes.length,
                configured: encryptionReady(),
            });
            return true;
        }
        if (req.method !== 'POST') fail(405, 'Method not allowed.');
        if (!encryptionReady()) fail(503, 'MFA encryption is not configured.');
        await throttle(pool, `mfa:${user.id}`, 20);
        const account = (
            await pool.query('SELECT password_hash FROM users WHERE id=$1', [
                user.id,
            ])
        ).rows[0];
        if (
            !(await bcrypt.compare(
                String(body.password || '').slice(0, 200),
                account.password_hash,
            ))
        )
            fail(400, 'Invalid password.');
        if (body.action === 'setup') {
            const row = (
                await pool.query('SELECT mfa_secret FROM users WHERE id=$1', [
                    user.id,
                ])
            ).rows[0];
            if (row.mfa_secret) fail(409, 'MFA is already enabled.');
            const secret = newTotpSecret();
            await pool.query(
                "UPDATE users SET mfa_pending_secret=$1,mfa_pending_until=now()+interval '10 minutes' WHERE id=$2",
                [seal(secret), user.id],
            );
            res.json({
                secret,
                uri: `otpauth://totp/${encodeURIComponent('Ochilink:' + user.email)}?secret=${secret}&issuer=Ochilink&algorithm=SHA1&digits=6&period=30`,
            });
            return true;
        }
        if (body.action === 'enable') {
            const codes = Array.from({ length: 8 }, () =>
                randomBytes(10).toString('hex'),
            );
            await transaction(pool, async (client) => {
                const row = (
                    await client.query(
                        'SELECT * FROM users WHERE id=$1 FOR UPDATE',
                        [user.id],
                    )
                ).rows[0];
                if (
                    row.mfa_secret ||
                    !row.mfa_pending_secret ||
                    new Date(row.mfa_pending_until) <= new Date()
                )
                    fail(400, 'Restart MFA setup.');
                const step = totpStep(
                    unseal(row.mfa_pending_secret),
                    body.code,
                );
                if (step === null) fail(400, 'Invalid authenticator code.');
                await client.query(
                    `UPDATE users SET mfa_secret=mfa_pending_secret,mfa_pending_secret=NULL,mfa_pending_until=NULL,mfa_last_step=$1,mfa_recovery_hashes=$2 WHERE id=$3`,
                    [step, JSON.stringify(codes.map(digest)), user.id],
                );
                await client.query(
                    'DELETE FROM hub_sessions WHERE user_id=$1 AND token_hash<>$2',
                    [user.id, keepHash],
                );
                await audit(client, user.id, 'MFA_ENABLED');
            });
            res.json({ ok: true, recovery_codes: codes, signed_out: false });
            return true;
        }
        if (body.action === 'disable') {
            await transaction(pool, async (client) => {
                if (!(await useMfa(client, user.id, body.code)))
                    fail(400, 'Invalid authenticator or recovery code.');
                await client.query(
                    "UPDATE users SET mfa_secret=NULL,mfa_last_step=-1,mfa_recovery_hashes='[]',mfa_pending_secret=NULL,mfa_pending_until=NULL WHERE id=$1",
                    [user.id],
                );
                await client.query(
                    'DELETE FROM hub_sessions WHERE user_id=$1 AND token_hash<>$2',
                    [user.id, keepHash],
                );
                await audit(client, user.id, 'MFA_DISABLED');
            });
            res.json({ ok: true, signed_out: false });
            return true;
        }
        fail(400, 'Invalid MFA action.');
    }
    if (resource === 'availability-admin') {
        if (req.method === 'GET') {
            res.json({
                slots: (
                    await pool.query(
                        "SELECT s.*, (SELECT c.client_name FROM consultations c WHERE c.slot_id=s.id AND (c.status='Scheduled' OR (c.status='Requested' AND (c.reserved_until>now() OR (c.checkout_required AND EXISTS (SELECT 1 FROM hub_payments hp WHERE hp.consultation_id=c.id AND hp.state='pending'))))) LIMIT 1) AS reserved_by FROM hub_availability s WHERE starts_at>now()-interval '1 day' ORDER BY starts_at LIMIT 500",
                    )
                ).rows,
            });
            return true;
        }
        if (req.method === 'POST') {
            const starts = new Date(body.starts_at),
                ends = new Date(body.ends_at);
            if (
                !Number.isFinite(starts.getTime()) ||
                !Number.isFinite(ends.getTime()) ||
                starts <= new Date() ||
                ends <= starts ||
                ends - starts > 8 * 3600000 ||
                ends - starts < 60000
            )
                fail(400, 'Choose a future slot between 1 minute and 8 hours.');
            await transaction(pool, async (client) => {
                await client.query(
                    'LOCK TABLE hub_availability IN SHARE ROW EXCLUSIVE MODE',
                );
                if (
                    (
                        await client.query(
                            'SELECT id FROM hub_availability WHERE is_enabled AND starts_at<$1 AND ends_at>$2',
                            [ends, starts],
                        )
                    ).rows.length
                )
                    fail(409, 'This availability overlaps another slot.');
                const slot = (
                    await client.query(
                        'INSERT INTO hub_availability(starts_at,ends_at) VALUES ($1,$2) RETURNING id',
                        [starts, ends],
                    )
                ).rows[0];
                await audit(client, user.id, 'AVAILABILITY_CREATED', {
                    slot_id: slot.id,
                });
            });
            res.json({ ok: true });
            return true;
        }
        if (req.method === 'DELETE') {
            await transaction(pool, async (client) => {
                await client.query(
                    'LOCK TABLE hub_availability IN SHARE ROW EXCLUSIVE MODE',
                );
                if (
                    (
                        await client.query(
                            "SELECT id FROM consultations WHERE slot_id=$1 AND (status='Scheduled' OR (status='Requested' AND (reserved_until>now() OR (checkout_required AND EXISTS (SELECT 1 FROM hub_payments hp WHERE hp.consultation_id=consultations.id AND hp.state='pending')))))",
                            [body.id],
                        )
                    ).rows.length
                )
                    fail(
                        409,
                        'This slot has an appointment or active reservation. Reschedule it first.',
                    );
                await client.query(
                    'UPDATE hub_availability SET is_enabled=false WHERE id=$1',
                    [body.id],
                );
                await audit(client, user.id, 'AVAILABILITY_REMOVED', {
                    slot_id: body.id,
                });
            });
            res.json({ ok: true });
            return true;
        }
    }
    if (resource === 'consultation-admin' && req.method === 'PUT') {
        if (
            !['Requested', 'Scheduled', 'Completed', 'Cancelled'].includes(
                body.status,
            )
        )
            fail(400, 'Invalid status.');
        const name = text(body.client_name, 160),
            email = text(body.client_email, 254).toLowerCase(),
            notes = text(body.notes ?? '', 3000, false);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            fail(400, 'Enter a valid email.');
        const amount =
            body.amount === null || body.amount === ''
                ? null
                : Number(body.amount);
        if (
            amount !== null &&
            (!Number.isFinite(amount) ||
                amount < 0 ||
                amount > 100000 ||
                Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001)
        )
            fail(400, 'Invalid USD amount.');
        await transaction(pool, async (client) => {
            await client.query(
                'LOCK TABLE hub_availability IN SHARE ROW EXCLUSIVE MODE',
            );
            const row = (
                await client.query(
                    'SELECT * FROM consultations WHERE id=$1 FOR UPDATE',
                    [body.id],
                )
            ).rows[0];
            if (!row) fail(404, 'Consultation not found.');
            if (row.checkout_required && row.payment_status === 'Unpaid' && row.status === 'Requested' && body.status !== 'Cancelled')
                fail(409, 'This client is checking out. Wait for payment or cancel the checkout before editing.');
            const changedAmount =
                Number(row.amount) !== Number(amount) ||
                (row.amount == null) !== (amount == null);
            if (changedAmount && row.payment_status !== 'Unpaid')
                fail(
                    409,
                    'Paid amounts cannot be edited. Manage refunds in Stripe.',
                );
            if (changedAmount || body.status === 'Cancelled')
                await invalidateCheckout(client, row.id);
            let scheduledAt = null,
                duration = row.duration_minutes,
                slotId = null;
            if (body.status === 'Completed') {
                if (!row.scheduled_at)
                    fail(
                        400,
                        'Schedule this consultation before marking it complete.',
                    );
                scheduledAt = row.scheduled_at;
                slotId = row.slot_id;
            } else if (body.slot_id && body.status !== 'Cancelled') {
                const slot = await reserveSlot(client, body.slot_id, row.id);
                slotId = slot.id;
                scheduledAt = slot.starts_at;
                duration = Math.min(row.duration_minutes, Math.round(
                    (new Date(slot.ends_at) - new Date(slot.starts_at)) / 60000,
                ));
            } else if (body.status === 'Scheduled')
                fail(
                    400,
                    'Choose an available slot to schedule this consultation.',
                );

            await client.query(
                `UPDATE consultations SET client_name=$1,client_email=$2,notes=$3,status=$4,amount=$5,
                scheduled_at=$6,duration_minutes=$7,slot_id=$8,reserved_until=CASE WHEN $4='Requested' AND $8::uuid IS NOT NULL THEN now()+interval '30 minutes' ELSE NULL END,
                payment_version=payment_version+$9,updated_at=now() WHERE id=$10`,
                [
                    name,
                    email,
                    notes,
                    body.status,
                    amount,
                    scheduledAt,
                    duration,
                    slotId,
                    changedAmount ? 1 : 0,
                    row.id,
                ],
            );
            await audit(client, user.id, 'CONSULTATION_UPDATED', {
                consultation_id: row.id,
            });
            await queueMail(
                client,
                'consultation-update',
                email,
                'Your Ochilink consultation was updated',
                `Status: ${body.status}.\n${scheduledAt ? 'Time: ' + new Date(scheduledAt).toISOString() + ' (UTC).' : 'No appointment time is confirmed.'}\n${amount == null ? 'Quote pending.' : 'Quoted amount: USD ' + amount.toFixed(2) + '.'}\nContact Ochilink if you have questions.`,
                `consultation-update/${row.id}/${secretToken()}`,
            );
        });
        await flushMail(pool, { limit: 3 });
        res.json({ ok: true });
        return true;
    }
    if (resource === 'payment-link' && req.method === 'POST') {
        if (!capabilities().email || !stripeReady())
            fail(
                503,
                'Configure email and Stripe before sending a payment link.',
            );
        let url;
        await transaction(pool, async (client) => {
            const row = (
                await client.query(
                    'SELECT * FROM consultations WHERE id=$1 FOR UPDATE',
                    [body.id],
                )
            ).rows[0];
            if (
                !row ||
                row.status === 'Cancelled' ||
                row.payment_status !== 'Unpaid' ||
                !(Number(row.amount) > 0)
            )
                fail(
                    409,
                    'Set a positive quote on an unpaid consultation first.',
                );
            await invalidateCheckout(client, row.id);
            await client.query(
                'UPDATE consultations SET payment_version=payment_version+1 WHERE id=$1',
                [row.id],
            );
            const token = secretToken();
            url = `${canonicalOrigin()}/#pay=${token}`;
            await client.query(
                "UPDATE consultations SET manage_token_hash=$1,manage_token_until=now()+interval '7 days' WHERE id=$2",
                [digest(token), row.id],
            );
            await queueMail(
                client,
                'payment-link',
                row.client_email,
                'Your Ochilink consultation payment link',
                `Your quote is ${row.currency} ${Number(row.amount).toFixed(2)}. Pay securely with Stripe: ${url}\nThis link expires in 7 days.`,
                `payment-link/${digest(token)}`,
            );
            await audit(client, user.id, 'PAYMENT_LINK_CREATED', {
                consultation_id: row.id,
            });
        });
        await flushMail(pool, { limit: 3 });
        res.json({ ok: true, url });
        return true;
    }
    if (resource === 'email-outbox') {
        if (req.method === 'POST') {
            if (body.action === 'retry' && body.id)
                await pool.query(
                    "UPDATE hub_email_outbox SET state='pending',attempts=0,available_at=now() WHERE id=$1 AND state='failed' AND payload_encrypted<>'' AND created_at>now()-interval '23 hours'",
                    [body.id],
                );
            res.json(await flushMail(pool));
            return true;
        }
        if (req.method === 'GET') {
            res.json({
                configured: mailReady(),
                emails: (
                    await pool.query(
                        'SELECT id,kind,state,attempts,last_error,created_at,sent_at FROM hub_email_outbox ORDER BY created_at DESC LIMIT 100',
                    )
                ).rows,
            });
            return true;
        }
    }
    if (resource === 'analytics-admin' && req.method === 'GET') {
        const [counts, clicks, scroll, pages] = await Promise.all([
            pool.query(
                "SELECT event_type,count(*)::int AS count FROM hub_analytics WHERE created_at>now()-interval '30 days' GROUP BY event_type",
            ),
            pool.query(
                "SELECT cell,count(*)::int AS count FROM hub_analytics WHERE event_type='click' AND cell IS NOT NULL AND created_at>now()-interval '30 days' GROUP BY cell",
            ),
            pool.query(
                "SELECT session_hash,max(depth)::int AS depth FROM hub_analytics WHERE event_type='scroll' AND created_at>now()-interval '30 days' GROUP BY session_hash",
            ),
            pool.query(
                "SELECT path,count(*)::int AS views FROM hub_analytics WHERE event_type='view' AND created_at>now()-interval '30 days' GROUP BY path ORDER BY views DESC LIMIT 10",
            ),
        ]);
        res.json({
            counts: counts.rows,
            clicks: clicks.rows,
            scroll: scroll.rows,
            pages: pages.rows,
        });
        return true;
    }
    fail(405, 'Method not allowed.');
}
