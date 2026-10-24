import { createHash, randomBytes } from 'node:crypto';
import { queueMail } from './mail.js';
import { canonicalOrigin } from './security.js';

const hash = (v) => createHash('sha256').update(v).digest('hex');
const token = () => randomBytes(32).toString('hex');

export function customerSessionToken(req) {
    const match = (req.headers.cookie || '').match(/(?:^|;\s*)ochi_customer_session=([a-f0-9]{64})(?:;|$)/);
    return match?.[1] || '';
}
export function setCustomerCookie(res, value = '', maxAge = 0) {
    res.setHeader(
        'Set-Cookie',
        `ochi_customer_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`,
    );
}
export async function currentCustomer(pool, req) {
    const raw = customerSessionToken(req);
    if (!raw) return null;
    return (await pool.query(
        `SELECT c.id,c.email,c.name,s.expires_at
         FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id
         WHERE s.token_hash=$1 AND s.expires_at>now() AND c.is_active`,
        [hash(raw)],
    )).rows[0] || null;
}
export async function ensureCustomerForApplication(client, application) {
    const customer = (await client.query(
        `INSERT INTO customer_accounts(email,name) VALUES ($1,$2)
         ON CONFLICT(email) DO UPDATE SET
           name=CASE WHEN customer_accounts.name='' THEN EXCLUDED.name ELSE customer_accounts.name END,
           updated_at=now()
         RETURNING id,email,name`,
        [application.applicant_email, application.applicant_name],
    )).rows[0];
    await client.query('UPDATE rental_applications SET customer_id=$1 WHERE id=$2', [customer.id, application.id]);
    for (const name of ['Applications','Identity','Income','Lease','Media','Other']) {
        await client.query(
            'INSERT INTO customer_folders(customer_id,name) VALUES ($1,$2) ON CONFLICT(customer_id,name) DO NOTHING',
            [customer.id,name],
        );
    }
    return customer;
}
export async function exchangeApplicationAccess(pool, applicationId, accessToken) {
    const app = (await pool.query(
        `SELECT r.*,c.id AS existing_customer_id
         FROM rental_applications r
         LEFT JOIN customer_accounts c ON c.id=r.customer_id
         WHERE r.id=$1 AND r.access_token_hash=$2 AND r.payment_status='paid'`,
        [applicationId, hash(accessToken)],
    )).rows[0];
    if (!app) throw Object.assign(new Error('Application access is invalid or payment is not complete.'), { status: 401 });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const customer = app.existing_customer_id
            ? (await client.query('SELECT id,email,name FROM customer_accounts WHERE id=$1 FOR UPDATE',[app.existing_customer_id])).rows[0]
            : await ensureCustomerForApplication(client, app);
        const raw = token();
        await client.query(
            `INSERT INTO customer_sessions(token_hash,customer_id,expires_at)
             VALUES ($1,$2,now()+interval '30 days')`,
            [hash(raw),customer.id],
        );
        await client.query('COMMIT');
        return { token: raw, customer };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}
export async function requestMagicLink(pool, email) {
    const normalized = String(email || '').trim().toLowerCase().slice(0,254);
    const customer = (await pool.query('SELECT id,email,name FROM customer_accounts WHERE email=$1 AND is_active',[normalized])).rows[0];
    if (!customer) return { ok: true };
    const raw = token();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO customer_magic_links(token_hash,customer_id,expires_at)
             VALUES ($1,$2,now()+interval '20 minutes')`,
            [hash(raw),customer.id],
        );
        const url = `${canonicalOrigin()}/account/?magic_token=${raw}`;
        await queueMail(
            client,
            'customer-magic-link',
            customer.email,
            'Sign in to your Ochilink account',
            `Use this secure link within 20 minutes to access your Ochilink account: ${url}`,
            `customer-login/${hash(raw)}`,
        );
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
    return { ok: true };
}
export async function exchangeMagicLink(pool, rawToken) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const row = (await client.query(
            `SELECT m.customer_id,c.email,c.name
             FROM customer_magic_links m JOIN customer_accounts c ON c.id=m.customer_id
             WHERE m.token_hash=$1 AND m.used_at IS NULL AND m.expires_at>now()
             FOR UPDATE`,
            [hash(String(rawToken || ''))],
        )).rows[0];
        if (!row) throw Object.assign(new Error('This sign-in link is invalid or expired.'), { status: 401 });
        await client.query('UPDATE customer_magic_links SET used_at=now() WHERE token_hash=$1',[hash(String(rawToken))]);
        const raw = token();
        await client.query(
            `INSERT INTO customer_sessions(token_hash,customer_id,expires_at)
             VALUES ($1,$2,now()+interval '30 days')`,
            [hash(raw),row.customer_id],
        );
        await client.query('COMMIT');
        return { token: raw, customer: { id: row.customer_id, email: row.email, name: row.name } };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}
