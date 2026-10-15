import { timingSafeEqual } from 'node:crypto';
import { getPool } from './_db.js';
import { flushMail } from '../lib/mail.js';
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const expected = process.env.CRON_SECRET
        ? `Bearer ${process.env.CRON_SECRET}`
        : '';
    const actual = String(req.headers.authorization || '');
    if (
        !expected ||
        expected.length !== actual.length ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
    )
        return res.status(401).json({ error: 'Unauthorized' });
    if (req.method !== 'GET') return res.status(405).end();
    const pool = getPool();
    try {
        const mail = await flushMail(pool, { limit: 5 });
        await pool.query('DELETE FROM hub_sessions WHERE expires_at<now()');
        await pool.query(
            "DELETE FROM hub_rate_limits WHERE window_start<now()-interval '2 days'",
        );
        await pool.query(
            "DELETE FROM hub_password_resets WHERE expires_at<now()-interval '1 day'",
        );
        await pool.query(
            'UPDATE users SET mfa_pending_secret=NULL,mfa_pending_until=NULL WHERE mfa_pending_until<now()',
        );
        await pool.query(
            "UPDATE consultations SET slot_id=NULL,scheduled_at=NULL,reserved_until=NULL WHERE status='Requested' AND reserved_until<now()",
        );
        await pool.query(
            "DELETE FROM hub_analytics WHERE created_at<now()-interval '90 days'",
        );
        await pool.query(
            "DELETE FROM security_auth_logs WHERE timestamp<now()-interval '90 days'",
        );
        await pool.query(
            "DELETE FROM system_error_logs WHERE created_at<now()-interval '90 days'",
        );
        await pool.query(
            "UPDATE hub_email_outbox SET payload_encrypted='',state='failed',last_error='EXPIRED' WHERE state<>'sent' AND created_at<now()-interval '23 hours'",
        );
        await pool.query(
            "DELETE FROM hub_email_outbox WHERE created_at<now()-interval '90 days'",
        );
        return res.json({ ok: true, mail });
    } catch {
        return res.status(503).json({ error: 'Maintenance failed.' });
    }
}
