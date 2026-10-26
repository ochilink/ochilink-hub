import { createSmokeTestHandler } from './_admin-live-smoke-test.js';
import { featureRequest, capabilities } from '../lib/features.js';
import { useMfa, encryptionReady } from '../lib/security.js';
import { queueMail, flushMail } from '../lib/mail.js';
import { checkout, prepareCheckout, stripeReady, stripeClient } from '../lib/payments.js';
import { reserveSlot } from '../lib/scheduling.js';
import { createRentalCheckout, getRentalFees, rentalApplicationStatus } from '../lib/rental.js';
import { adminRentalDocumentDownload, listRentalApplications, rentalApplicationAdminDetail, rentalFeeAdminSnapshot, updateRentalApplicationStatus, updateRentalFees } from '../lib/rental-admin.js';
import { activatePreviewVersion, beginAppPreviewUpload, completeAppPreviewUpload, listAppPreviews, setPreviewEnabled } from '../lib/app-previews.js';
import {
    currentCustomer,
    customerSessionToken,
    exchangeApplicationAccess,
    exchangeMagicLink,
    requestMagicLink,
    setCustomerCookie,
} from '../lib/customer.js';
import {
    beginUpload,
    completeUpload,
    createFolder as createCustomerFolder,
    documentDownload,
    listCustomerDocuments,
    updateDocument,
} from '../lib/documents.js';
import { createHash, randomBytes, createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getPool } from './_db.js';

function requestOrigin(req) {
    const host = String(req.headers?.host || '').trim();
    const origin = String(req.headers?.origin || '').trim();
    if (host && origin === `https://${host}`) return origin;
    return null;
}
function clientIp(req) {
    // Vercel supplies a proxy-controlled client IP; do not trust arbitrary
    // forwarding chains when Vercel's request marker is present.
    const headers = req.headers || {};
    const value = headers['x-vercel-id']
        ? headers['x-vercel-forwarded-for'] || headers['x-real-ip'] || 'unknown'
        : headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    return String(value).split(',')[0].trim() || 'unknown';
}
const hash = (value) => createHash('sha256').update(value).digest('hex');

function requestAuditMetadata(req, category) {
    const secret = process.env.RATE_LIMIT_SECRET;
    const ip = clientIp(req);
    const ua = String(req.headers?.['user-agent'] || '').slice(0, 1024);
    const browser = /Edg\//i.test(ua) ? 'Edge'
        : /Firefox\//i.test(ua) ? 'Firefox'
        : /Chrome\//i.test(ua) ? 'Chrome'
        : /Safari\//i.test(ua) ? 'Safari' : 'Other';
    return {
        ...(secret && secret.length >= 32 && ip !== 'unknown'
            ? { ip_hash: createHmac('sha256', secret).update('audit-ip:' + ip).digest('hex') }
            : {}),
        browser,
        ...(category ? { category } : {}),
    };
}

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function fail(status, message) {
    throw new HttpError(status, message);
}
function text(value, max, required = true) {
    if (
        typeof value !== 'string' ||
        value.trim().length > max ||
        (required && !value.trim())
    ) {
        fail(400, 'Please check the form fields.');
    }
    return value.trim();
}
function appInput(body) {
    const name = text(body.name, 120);
    const slug = text(
        body.slug ||
            name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, ''),
        160,
    );
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
        fail(400, 'Use a valid app slug.');
    const link = body.link ? text(body.link, 2048) : null;
    if (link) {
        let url;
        try {
            url = new URL(link);
        } catch {
            fail(400, 'Enter a valid HTTPS link.');
        }
        if (
            url.protocol !== 'https:' ||
            !url.hostname ||
            url.username ||
            url.password
        )
            fail(400, 'Enter a valid HTTPS link.');
    }
    const coverImageUrl = body.cover_image_url
        ? text(body.cover_image_url, 150000)
        : null;
    if (coverImageUrl) {
        if (coverImageUrl.startsWith('data:')) {
            if (
                !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
                    coverImageUrl,
                )
            )
                fail(400, 'Use a valid JPG, PNG, or WebP cover image.');
        } else {
            let imageUrl;
            try {
                imageUrl = new URL(coverImageUrl);
            } catch {
                fail(400, 'Enter a valid HTTPS cover image URL.');
            }
            if (
                imageUrl.protocol !== 'https:' ||
                !imageUrl.hostname ||
                imageUrl.username ||
                imageUrl.password
            )
                fail(400, 'Enter a valid HTTPS cover image URL.');
        }
    }
    const coverPreviewImage =
        body.cover_preview_image === undefined || body.cover_preview_image === null
            ? null
            : text(body.cover_preview_image, 700000);
    if (
        coverPreviewImage &&
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
            coverPreviewImage,
        )
    )
        fail(400, 'Use a valid high-resolution JPG, PNG, or WebP preview.');
    if (!['Live', 'Coming Soon'].includes(body.status))
        fail(400, 'Invalid status.');
    if (
        !Array.isArray(body.tech) ||
        body.tech.length > 15 ||
        body.tech.some((x) => typeof x !== 'string' || x.length > 60)
    )
        fail(400, 'Invalid technologies.');
    if (typeof body.is_published !== 'boolean')
        fail(400, 'Choose publication status.');
    if (
        !Number.isInteger(body.sort_order) ||
        Math.abs(body.sort_order) > 100000
    )
        fail(400, 'Invalid sort order.');
    return [
        slug,
        name,
        text(body.description ?? '', 2000, false),
        link,
        body.tech,
        body.status,
        body.is_published,
        body.sort_order,
        coverImageUrl,
        coverPreviewImage,
    ];
}
async function audit(client, actor, event, metadata = {}) {
    await client.query(
        'INSERT INTO security_auth_logs (actor_id,event_type,metadata) VALUES ($1,$2,$3)',
        [actor, event, metadata],
    );
}
async function transaction(pool, fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
function cookie(res, token = '', maxAge = 0) {
    res.setHeader(
        'Set-Cookie',
        `ochi_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`,
    );
}
function sessionToken(req) {
    const match = (req.headers.cookie || '').match(
        /(?:^|;\s*)ochi_session=([a-f0-9]{64})(?:;|$)/,
    );
    return match?.[1] || '';
}
async function currentUser(pool, req) {
    const token = sessionToken(req);
    if (!token) return null;
    return (
        (
            await pool.query(
                `SELECT u.id,u.email,u.name,u.role,s.expires_at FROM hub_sessions s
        JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active`,
                [hash(token)],
            )
        ).rows[0] || null
    );
}
async function throttle(pool, key, limit, req, category) {
    const secret = process.env.RATE_LIMIT_SECRET;
    if (!secret || secret.length < 32)
        fail(503, 'Login configuration is incomplete.');
    const bucket = createHmac('sha256', secret).update(key).digest('hex');
    const { rows } = await pool.query(
        `INSERT INTO hub_rate_limits (bucket_hash,window_start)
        VALUES ($1,date_trunc('hour',now())) ON CONFLICT (bucket_hash,window_start)
        DO UPDATE SET attempts=hub_rate_limits.attempts+1 RETURNING attempts`,
        [bucket],
    );
    if (rows[0].attempts > limit) {
        await audit(pool, null, 'RATE_LIMITED', requestAuditMetadata(req, category));
        fail(429, 'Too many attempts. Please try again later.');
    }
}
async function login(pool, req, res, body) {
    const email = text(body.email, 254).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || Buffer.byteLength(password, 'utf8') > 72)
        fail(400, 'Invalid email or password.');
    const ip = clientIp(req);
    await throttle(pool, `ip:${ip}`, 30, req, 'login_ip');
    await throttle(pool, `email:${email}`, 10, req, 'login_email');
    const user = (
        await pool.query('SELECT * FROM users WHERE email=$1', [email])
    ).rows[0];
    // A real bcrypt comparison also runs for unknown accounts.
    const valid = await bcrypt.compare(
        password,
        user?.password_hash ||
            '$2a$12$C6UzMDM.H6dfI/f/IKcEe.5qvEArY.FY2QABHdbBKlrvqHwYQ0TUa',
    );
    const blocked =
        user?.locked_until && new Date(user.locked_until) > new Date();
    if (
        !user ||
        !valid ||
        blocked ||
        !user.is_active ||
        user.role !== 'admin'
    ) {
        await transaction(pool, async (client) => {
            if (user && !blocked)
                await client.query(
                    `UPDATE users SET failed_attempts=failed_attempts+1,
                locked_until=CASE WHEN failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END,
                updated_at=now() WHERE id=$1`,
                    [user.id],
                );
            await audit(client, user?.id || null, 'LOGIN_FAILED', requestAuditMetadata(req, 'login'));
        });
        fail(401, 'Invalid email or password.');
    }
    if (user.mfa_secret) {
        if (!body.otp) return { mfa_required: true };
        const accepted = await transaction(pool, (client) =>
            useMfa(client, user.id, body.otp),
        );
        if (!accepted) {
            await audit(pool, user.id, 'MFA_FAILED', requestAuditMetadata(req, 'mfa'));
            fail(401, 'Invalid authenticator or recovery code.');
        }
    }
    const token = randomBytes(32).toString('hex');
    await transaction(pool, async (client) => {
        await client.query(
            'UPDATE users SET failed_attempts=0,locked_until=NULL,updated_at=now() WHERE id=$1',
            [user.id],
        );
        await client.query(
            `INSERT INTO hub_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '15 minutes')`,
            [hash(token), user.id],
        );
        await audit(client, user.id, 'LOGIN_SUCCESS', requestAuditMetadata(req, 'login'));
    });
    cookie(res, token, 900);
    return {
        ok: true,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        },
    };
}
export function createHandler(poolProvider = getPool, stripeProvider = stripeClient) {
    const smokeHandler = createSmokeTestHandler({ poolProvider, stripeProvider });
    return async function handler(req, res) {
        if (req.query?.resource === 'admin-live-smoke-test') return smokeHandler(req, res);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        try {
            if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method))
                fail(405, 'Method not allowed.');
            const resource = req.query?.resource || 'public';
            const requestSizeLimit =
                resource === 'apps' && ['POST', 'PUT'].includes(req.method)
                    ? 900000
                    : resource === 'rental' && req.method === 'POST'
                      ? 220000
                      : 16384;
            if (req.method !== 'GET') {
                const host = req.headers.host;
                // Reject browser mutations without a matching Origin. No wildcard CORS.
                if (req.headers.origin !== `https://${host}`)
                    fail(403, 'Request origin rejected.');
                if (
                    !(req.headers['content-type'] || '').startsWith(
                        'application/json',
                    )
                )
                    fail(415, 'JSON required.');
                if (
                    Number(req.headers['content-length'] || 0) >
                    requestSizeLimit
                )
                    fail(413, 'Request too large.');
            }
            const body = req.body || {};
            if (
                Buffer.byteLength(JSON.stringify(body)) >
                requestSizeLimit
            )
                fail(413, 'Request too large.');
            const pool = poolProvider();
            if (resource === 'public' && req.method === 'GET') {
                const apps = await pool.query(
                    `SELECT a.id,a.slug,a.name,a.description,a.link,a.tech,a.status,a.sort_order,a.cover_image_url,
                            a.preview_enabled,p.public_url AS preview_url,p.version AS preview_version
                     FROM apps a
                     LEFT JOIN LATERAL (
                       SELECT public_url,version FROM app_previews
                       WHERE app_id=a.id AND state='ready' AND is_active
                       ORDER BY version DESC LIMIT 1
                     ) p ON true
                     WHERE a.is_published ORDER BY a.sort_order,a.name`,
                );
                const pricing = await pool.query(
                    "SELECT value FROM site_settings WHERE key='consultation_pricing'",
                );
                return res.json({
                    apps: apps.rows,
                    pricing: pricing.rows[0]?.value || null,
                    capabilities: capabilities(),
                });
            }
            if (resource === 'cover-preview' && req.method === 'GET') {
                const slug = text(req.query?.slug || '', 160);
                if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
                    fail(400, 'Invalid app preview.');
                const result = await pool.query(
                    'SELECT cover_preview_image,cover_image_url FROM apps WHERE slug=$1 AND is_published LIMIT 1',
                    [slug],
                );
                if (!result.rows[0]) fail(404, 'App preview not found.');
                return res.json({
                    preview:
                        result.rows[0].cover_preview_image ||
                        result.rows[0].cover_image_url ||
                        null,
                });
            }
            if (resource === 'rental' && req.method === 'GET') {
                const action = String(req.query?.action || 'fees');
                if (action === 'fees') return res.json(await getRentalFees(pool));
                if (action === 'status')
                    return res.json(await rentalApplicationStatus(
                        pool,
                        req.query?.id,
                        req.query?.access_token,
                        stripeReady() ? stripeProvider() : null,
                    ));
                fail(400, 'Invalid rental action.');
            }
            if (resource === 'rental' && req.method === 'POST') {
                if (String(req.query?.action || '') !== 'submit')
                    fail(400, 'Invalid rental action.');
                const result = await createRentalCheckout(
                    pool,
                    body,
                    stripeReady() ? stripeProvider() : null,
                    requestOrigin(req),
                );
                return res.status(201).json(result);
            }
            if (resource === 'customer-auth') {
                const action = String(req.query?.action || '');
                if (req.method === 'POST' && action === 'request-link') {
                    const email = text(body.email, 254).toLowerCase();
                    await throttle(pool, `customer-link-ip:${clientIp(req)}`, 20, req, 'customer_magic_link_ip');
                    await throttle(pool, `customer-link-email:${email}`, 6, req, 'customer_magic_link_email');
                    const result = await requestMagicLink(pool, email);
                    await flushMail(pool, { limit: 2 });
                    return res.json(result);
                }
                if (req.method === 'POST' && action === 'exchange-application') {
                    const result = await exchangeApplicationAccess(
                        pool,
                        body.application_id,
                        body.access_token,
                    );
                    setCustomerCookie(res, result.token, 30 * 24 * 60 * 60);
                    return res.json({ customer: result.customer });
                }
                if (req.method === 'POST' && action === 'exchange-magic') {
                    const result = await exchangeMagicLink(pool, body.magic_token);
                    setCustomerCookie(res, result.token, 30 * 24 * 60 * 60);
                    return res.json({ customer: result.customer });
                }
                const customer = await currentCustomer(pool, req);
                if (req.method === 'GET' && action === 'session')
                    return res.json({ customer });
                if (req.method === 'POST' && action === 'logout') {
                    if (customer) {
                        await pool.query(
                            'DELETE FROM customer_sessions WHERE token_hash=$1',
                            [hash(customerSessionToken(req))],
                        );
                    }
                    if (customer)
                        await audit(pool, null, 'CUSTOMER_LOGOUT', { customer_id: customer.id });
                    setCustomerCookie(res);
                    return res.json({ ok: true });
                }
                fail(400, 'Invalid customer account action.');
            }
            if (resource === 'customer-documents') {
                const customer = await currentCustomer(pool, req);
                if (!customer) fail(401, 'Please sign in to your customer account.');
                const action = String(req.query?.action || 'list');
                if (req.method === 'GET' && action === 'list')
                    return res.json(await listCustomerDocuments(
                        pool,
                        customer.id,
                        String(req.query?.filter || 'all'),
                        String(req.query?.q || ''),
                    ));
                if (req.method === 'GET' && action === 'download')
                    return res.json(await documentDownload(pool, customer.id, req.query?.id));
                if (req.method === 'POST' && action === 'folder')
                    return res.status(201).json(await createCustomerFolder(pool, customer.id, body.name));
                if (req.method === 'POST' && action === 'begin-upload')
                    return res.status(201).json(await beginUpload(pool, customer.id, body));
                if (req.method === 'POST' && action === 'complete-upload')
                    return res.json(await completeUpload(pool, customer.id, body));
                if (req.method === 'PUT' && action === 'document')
                    return res.json(await updateDocument(pool, customer.id, body));
                fail(400, 'Invalid document action.');
            }
            if (resource === 'login' && req.method === 'POST')
                return res.json(await login(pool, req, res, body));
            const user = await currentUser(pool, req);
            if (
                await featureRequest({
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
                })
            )
                return;
            if (resource === 'consultations' && req.method === 'POST') {
                const clientName = text(body.client_name, 160);
                const email = text(body.client_email, 254).toLowerCase();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                    fail(400, 'Enter a valid email.');
                let notes = text(body.notes ?? '', 3000, false);
                const duration = body.duration_minutes == null ? null : Number(body.duration_minutes);
                if (duration !== null && ![60,120,180].includes(duration)) fail(400, 'Choose 1, 2 or 3 hours.');
                if (body.booking && (!stripeReady() || !encryptionReady())) fail(503, 'Online booking payments are not configured yet.');
                if (body.booking && !/^[a-f0-9]{64}$/.test(body.booking_token || '')) fail(400, 'Reload the booking page and try again.');
                if (body.booking && !body.slot_id) fail(400, 'Choose an available appointment slot.');
                if (body.service !== undefined) {
                    if (!['Website Audit','Real Estate Tech','Custom App','CRM Setup','General'].includes(body.service)) fail(400, 'Choose a valid service.');
                    notes = `Service: ${body.service}\nPhone: ${text(body.phone ?? '', 60, false)}\n${notes}`;
                }
                const ip = clientIp(req);
                await throttle(pool, `consultation:${ip}`, 5, req, 'consultation');
                const bookingToken = body.booking ? body.booking_token : null;
                await transaction(pool, async (client) => {
                    // Serialize retries before checking the token or reserving a slot.
                    await client.query('LOCK TABLE hub_availability IN SHARE ROW EXCLUSIVE MODE');
                    if (bookingToken) {
                        const previous = (await client.query('SELECT id FROM consultations WHERE manage_token_hash=$1 AND checkout_required', [hash(bookingToken)])).rows[0];
                        if (previous) return;
                    }
                    let slot = null;
                    if (body.slot_id)
                        slot = await reserveSlot(client, body.slot_id);
                    if (bookingToken && new Date(slot.starts_at).getTime() < Date.now() + 35*60000) fail(409, 'Choose a time at least 35 minutes from now to allow checkout to finish.');
                    if (duration && (!slot || duration * 60000 > new Date(slot.ends_at)-new Date(slot.starts_at))) fail(409, 'Choose a slot long enough for this duration.');
                    const minutes = duration || (slot ? Math.round((new Date(slot.ends_at)-new Date(slot.starts_at))/60000) : 120);
                    const pricing = (await client.query("SELECT value FROM site_settings WHERE key='consultation_pricing'")).rows[0]?.value;
                    const quote = pricing ? Math.round(Math.max(Number(pricing.minimum), Number(pricing.hourly)*minutes/60)*100)/100 : null;
                    if (body.booking && (!Number.isFinite(quote) || quote === null || quote <= 0)) fail(503, 'Booking pricing is temporarily unavailable.');
                    const result = await client.query(
                        `INSERT INTO consultations(client_name,client_email,notes,slot_id,scheduled_at,duration_minutes,amount,reserved_until,checkout_required,manage_token_hash,manage_token_until)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $4::uuid IS NOT NULL THEN now()+CASE WHEN $8 THEN interval '35 minutes' ELSE interval '30 minutes' END ELSE NULL END,$8,$9,CASE WHEN $8 THEN now()+interval '1 day' ELSE NULL END) RETURNING id`,
                        [
                            clientName,
                            email,
                            notes,
                            slot?.id || null,
                            slot?.starts_at || null,
                            minutes,
                            quote,
                            !!bookingToken,
                            bookingToken ? hash(bookingToken) : null,
                        ],
                    );
                    await audit(client, null, 'CONSULTATION_REQUESTED', {
                        consultation_id: result.rows[0].id,
                    });
                    if (bookingToken) {
                        await prepareCheckout(client, bookingToken);
                    }
                    if (!bookingToken && encryptionReady()) {
                        await queueMail(
                            client,
                            'consultation-request',
                            email,
                            'Your Ochilink consultation request',
                            `We received your consultation request. ${slot ? 'Requested time: ' + new Date(slot.starts_at).toISOString() + ' UTC. This temporary reservation lasts 30 minutes. ' : ''}An administrator must confirm the appointment.`,
                            `consultation-request/${result.rows[0].id}`,
                        );
                        if (process.env.NOTIFICATION_EMAIL)
                            await queueMail(
                                client,
                                'admin-notification',
                                process.env.NOTIFICATION_EMAIL,
                                'New Ochilink consultation request',
                                'A new consultation request is waiting in Ochilink Admin.',
                                `consultation-admin/${result.rows[0].id}`,
                            );
                    }
                });
                if (bookingToken) {
                    // Commit the hold/payment before Stripe: a timeout or lost response
                    // can then be retried with the same token and Stripe idempotency key.
                    const result = await transaction(pool, client => checkout(client, bookingToken, stripeProvider(), requestOrigin(req)));
                    return res.status(201).json({ ok: true, checkout_url: result.url });
                }
                await flushMail(pool, { limit: 3 });
                return res.status(201).json({ ok: true });
            }
            if (resource === 'session' && req.method === 'GET')
                return res.json({ user });
            if (!user) fail(401, 'Please sign in again.');
            if (resource === 'logout' && req.method === 'POST') {
                await transaction(pool, async (client) => {
                    await client.query(
                        'DELETE FROM hub_sessions WHERE token_hash=$1',
                        [hash(sessionToken(req))],
                    );
                    await audit(client, user.id, 'LOGOUT', requestAuditMetadata(req, 'logout'));
                });
                cookie(res);
                return res.json({ ok: true });
            }
            if (user.role !== 'admin')
                fail(403, 'Administrator access required.');
            if (resource === 'rental-admin') {
                const action = String(req.query?.action || 'list');
                if (req.method === 'GET' && action === 'list')
                    return res.json(await listRentalApplications(
                        pool,
                        String(req.query?.q || ''),
                        String(req.query?.status || 'all'),
                    ));
                if (req.method === 'GET' && action === 'detail')
                    return res.json(await rentalApplicationAdminDetail(pool, req.query?.id));
                if (req.method === 'GET' && action === 'download') {
                    const result = await adminRentalDocumentDownload(
                        pool,
                        req.query?.application_id,
                        req.query?.document_id,
                    );
                    await audit(pool, user.id, 'ADMIN_RENTAL_DOCUMENT_OPENED', {
                        application_id: req.query?.application_id,
                        document_id: req.query?.document_id,
                    });
                    return res.json(result);
                }
                if (req.method === 'PUT' && action === 'status') {
                    const result = await transaction(pool, (client) =>
                        updateRentalApplicationStatus(
                            client,
                            user.id,
                            body.id,
                            String(body.status || ''),
                        ),
                    );
                    return res.json({ application: result });
                }
                fail(400, 'Invalid rental admin action.');
            }
            if (resource === 'app-preview') {
                const action = String(req.query?.action || 'list');
                if (req.method === 'GET' && action === 'list')
                    return res.json(await listAppPreviews(pool, req.query?.app_id || null));
                if (req.method === 'POST' && action === 'begin-upload')
                    return res.status(201).json(await beginAppPreviewUpload(pool, user.id, body));
                if (req.method === 'POST' && action === 'complete-upload') {
                    const result = await transaction(pool, (client) =>
                        completeAppPreviewUpload(client, user.id, body),
                    );
                    return res.json({ preview: result });
                }
                if (req.method === 'PUT' && action === 'enabled') {
                    const result = await transaction(pool, (client) =>
                        setPreviewEnabled(client, user.id, body.app_id, !!body.enabled),
                    );
                    return res.json(result);
                }
                if (req.method === 'PUT' && action === 'activate') {
                    const result = await transaction(pool, (client) =>
                        activatePreviewVersion(client, user.id, body.preview_id),
                    );
                    return res.json(result);
                }
                fail(400, 'Invalid app preview action.');
            }
            if (resource === 'admin' && req.method === 'GET') {
                const [
                    apps,
                    users,
                    logs,
                    errors,
                    consultations,
                    settings,
                    activity,
                    totals,
                ] = await Promise.all([
                    pool.query(`SELECT a.id,a.slug,a.name,a.description,a.link,a.tech,a.status,a.is_published,a.sort_order,
                               a.cover_image_url,(a.cover_preview_image IS NOT NULL) AS has_cover_preview,
                               a.preview_enabled,p.public_url AS preview_url,p.version AS preview_version,
                               a.created_at,a.updated_at
                        FROM apps a
                        LEFT JOIN LATERAL (
                          SELECT public_url,version FROM app_previews
                          WHERE app_id=a.id AND state='ready' AND is_active
                          ORDER BY version DESC LIMIT 1
                        ) p ON true
                        ORDER BY a.sort_order,a.name`),
                    pool.query(
                        'SELECT id,email,name,role,is_active,failed_attempts,locked_until,created_at FROM users ORDER BY created_at DESC LIMIT 200',
                    ),
                    pool.query(
                        'SELECT * FROM security_auth_logs ORDER BY timestamp DESC LIMIT 100',
                    ),
                    pool.query(
                        'SELECT * FROM system_error_logs ORDER BY created_at DESC LIMIT 100',
                    ),
                    pool.query(
                        'SELECT * FROM consultations ORDER BY created_at DESC LIMIT 100',
                    ),
                    pool.query(
                        "SELECT value FROM site_settings WHERE key='consultation_pricing'",
                    ),
                    pool.query(`SELECT day::date::text AS day, count(l.log_id)::int AS events,
                    count(l.log_id) FILTER (WHERE l.event_type IN ('LOGIN_FAILED','MFA_FAILED'))::int AS failed_auth,
                    count(l.log_id) FILTER (WHERE l.event_type='RATE_LIMITED')::int AS blocked
                    FROM generate_series(current_date-6,current_date,interval '1 day') AS day
                    LEFT JOIN security_auth_logs l ON l.timestamp>=day AND l.timestamp<day+interval '1 day'
                    GROUP BY day ORDER BY day`),
                    pool.query(`SELECT (SELECT count(*)::int FROM users) AS users,
                    (SELECT count(*)::int FROM consultations) AS consultations,
                    (SELECT coalesce(sum(amount_cents-refunded_cents),0)/100.0 FROM hub_payments WHERE state IN ('paid','refunded')) AS paid_revenue,
                    (SELECT count(*)::int FROM security_auth_logs WHERE event_type='LOGIN_FAILED' AND timestamp>=now()-interval '24 hours') AS failed_logins`),
                ]);
                return res.json({
                    apps: apps.rows,
                    users: users.rows,
                    logs: logs.rows,
                    errors: errors.rows,
                    consultations: consultations.rows,
                    pricing: settings.rows[0]?.value,
                    activity: activity.rows,
                    totals: totals.rows[0],
                });
            }
            if (
                resource === 'apps' &&
                ['POST', 'PUT', 'DELETE'].includes(req.method)
            ) {
                const result = await transaction(pool, async (client) => {
                    if (req.method === 'DELETE') {
                        const result = await client.query(
                            'DELETE FROM apps WHERE id=$1 RETURNING id',
                            [body.id],
                        );
                        if (!result.rowCount) fail(404, 'App not found.');
                        await audit(client, user.id, 'APP_DELETED', {
                            app_id: body.id,
                        });
                        return { ok: true };
                    }
                    const input = appInput(body);
                    const result =
                        req.method === 'POST'
                            ? await client.query(
                                  `INSERT INTO apps (slug,name,description,link,tech,status,is_published,sort_order,cover_image_url,cover_preview_image)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
                                  input,
                              )
                            : await client.query(
                                  `UPDATE apps SET slug=$1,name=$2,description=$3,link=$4,tech=$5,status=$6,
                        is_published=$7,sort_order=$8,cover_image_url=$9,
                        cover_preview_image=CASE
                            WHEN $11::boolean THEN NULL
                            WHEN $10::text IS NOT NULL THEN $10
                            ELSE cover_preview_image
                        END,
                        updated_at=now() WHERE id=$12 RETURNING *`,
                                  [...input, !!body.remove_cover_preview, body.id],
                              );
                    if (!result.rowCount) fail(404, 'App not found.');
                    await audit(
                        client,
                        user.id,
                        req.method === 'POST' ? 'APP_CREATED' : 'APP_UPDATED',
                        { app_id: result.rows[0].id },
                    );
                    return { app: result.rows[0] };
                });
                return res.json(result);
            }
            if (resource === 'users' && req.method === 'PUT') {
                if (!['role', 'unlock'].includes(body.action))
                    fail(400, 'Invalid user action.');
                if (
                    body.action === 'role' &&
                    !['admin', 'staff', 'vendor', 'customer'].includes(
                        body.role,
                    )
                )
                    fail(400, 'Invalid role.');
                if (body.action === 'role' && body.id === user.id)
                    fail(400, 'You cannot change your own administrator role.');
                await transaction(pool, async (client) => {
                    await client.query(
                        'LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE',
                    );
                    const target = (
                        await client.query(
                            'SELECT id,role,is_active FROM users WHERE id=$1 FOR UPDATE',
                            [body.id],
                        )
                    ).rows[0];
                    if (!target) fail(404, 'User not found.');
                    if (body.action === 'role') {
                        if (
                            target.role === 'admin' &&
                            target.is_active &&
                            body.role !== 'admin'
                        ) {
                            const count = (
                                await client.query(
                                    "SELECT count(*)::int AS count FROM users WHERE role='admin' AND is_active",
                                )
                            ).rows[0].count;
                            if (count <= 1)
                                fail(
                                    400,
                                    'Keep at least one active administrator.',
                                );
                        }
                        await client.query(
                            'UPDATE users SET role=$1,updated_at=now() WHERE id=$2',
                            [body.role, body.id],
                        );
                        await client.query(
                            'DELETE FROM hub_sessions WHERE user_id=$1',
                            [body.id],
                        );
                        await audit(client, user.id, 'ROLE_CHANGED', {
                            user_id: body.id,
                            role: body.role,
                        });
                    } else {
                        await client.query(
                            'UPDATE users SET failed_attempts=0,locked_until=NULL,updated_at=now() WHERE id=$1',
                            [body.id],
                        );
                        await audit(client, user.id, 'ACCOUNT_UNLOCKED', {
                            user_id: body.id,
                        });
                    }
                });
                return res.json({ ok: true });
            }
            if (resource === 'pricing' && req.method === 'PUT') {
                const { hourly, minimum } = body;
                if (
                    ![hourly, minimum].every(
                        (v) =>
                            typeof v === 'number' &&
                            Number.isFinite(v) &&
                            v >= 0 &&
                            v <= 100000,
                    )
                )
                    fail(400, 'Invalid pricing.');
                await transaction(pool, async (client) => {
                    await client.query(
                        `INSERT INTO site_settings (key,value,updated_by) VALUES ('consultation_pricing',$1,$2)
                    ON CONFLICT (key) DO UPDATE SET value=$1,updated_by=$2,updated_at=now()`,
                        [{ hourly, minimum, currency: 'USD' }, user.id],
                    );
                    await audit(client, user.id, 'PRICING_UPDATED');
                });
                return res.json({ ok: true });
            }
            fail(404, 'Endpoint not found.');
        } catch (error) {
            const status =
                error.status ||
                (error.code === '23505'
                    ? 409
                    : error.code === '22P02'
                      ? 400
                      : 500);
            if (status === 500) {
                console.error('Hub request failed', {
                    code: error.code || 'INTERNAL',
                });
                try {
                    await poolProvider().query(
                        "INSERT INTO system_error_logs(severity,service,message,path) VALUES ('ERROR','hub-api',$1,'/api/hub')",
                        [String(error.code || 'INTERNAL').slice(0, 60)],
                    );
                } catch {
                    /* A database outage cannot be logged into that database. */
                }
            }
            return res
                .status(status)
                .json({
                    error:
                        status === 500
                            ? 'Service unavailable. Please try again.'
                            : status === 409
                              ? 'This record already exists.'
                              : status === 400 && !error.status
                                ? 'Invalid record identifier.'
                                : error.message,
                });
        }
    };
}
export default createHandler();
