import { seal, unseal } from './security.js';
export const mailReady = () =>
    !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
export async function queueMail(client, kind, to, subject, text, dedupeKey) {
    await client.query(
        `INSERT INTO hub_email_outbox(kind,payload_encrypted,dedupe_key) VALUES ($1,$2,$3)
        ON CONFLICT (dedupe_key) DO NOTHING`,
        [kind, seal(JSON.stringify({ to, subject, text })), dedupeKey],
    );
}
export async function flushMail(pool, { limit = 5, fetcher = fetch } = {}) {
    if (!mailReady()) return { sent: 0, configured: false };
    let sent = 0;
    for (let i = 0; i < limit; i++) {
        const client = await pool.connect();
        let row;
        try {
            await client.query('BEGIN');
            row = (
                await client.query(`SELECT * FROM hub_email_outbox WHERE
                (state='pending' OR (state='sending' AND available_at<now())) AND available_at<=now() AND created_at>now()-interval '23 hours'
                ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`)
            ).rows[0];
            if (row)
                await client.query(
                    "UPDATE hub_email_outbox SET state='sending',attempts=attempts+1,available_at=now()+interval '5 minutes' WHERE id=$1",
                    [row.id],
                );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        if (!row) break;
        if (
            row.kind === 'password-reset' &&
            Date.now() - new Date(row.created_at).getTime() > 30 * 60000
        ) {
            await pool.query(
                "UPDATE hub_email_outbox SET state='failed',last_error='RESET_EXPIRED',payload_encrypted='' WHERE id=$1",
                [row.id],
            );
            continue;
        }
        try {
            const payload = JSON.parse(unseal(row.payload_encrypted));
            const response = await fetcher('https://api.resend.com/emails', {
                method: 'POST',
                signal: AbortSignal.timeout(8000),
                headers: {
                    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': `ochilink/${row.id}`,
                },
                body: JSON.stringify({
                    from: process.env.MAIL_FROM,
                    to: [payload.to],
                    subject: payload.subject,
                    text: payload.text,
                }),
            });
            if (!response.ok)
                throw new Error(`PROVIDER_HTTP_${response.status}`);
            const result = await response.json();
            if (!result.id) throw new Error('PROVIDER_RESPONSE_INVALID');
            await pool.query(
                "UPDATE hub_email_outbox SET state='sent',provider_id=$1,sent_at=now(),last_error=NULL,payload_encrypted='' WHERE id=$2",
                [result.id, row.id],
            );
            sent++;
        } catch (error) {
            const attempts = row.attempts + 1;
            await pool.query(
                `UPDATE hub_email_outbox SET state=$1,last_error=$2,available_at=now()+interval '5 minutes' WHERE id=$3`,
                [
                    attempts >= 10 ? 'failed' : 'pending',
                    /^PROVIDER_/.test(error.message)
                        ? error.message
                        : 'DELIVERY_FAILED',
                    row.id,
                ],
            );
        }
    }
    return { sent, configured: true };
}
