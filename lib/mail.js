import { seal, unseal } from './security.js';

export const mailReady = () =>
    !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

const escapeHtml = (value = '') =>
    String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

function shell({ eyebrow, title, intro, body, ctaLabel, ctaUrl, footer }) {
    const safeCta = /^https:\/\//.test(ctaUrl || '') ? ctaUrl : 'https://ochilink.com';
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#f3f6f8;font-family:Inter,Arial,sans-serif;color:#101827">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f8;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4e8ec">
<tr><td style="background:#0B0F1A;padding:28px 34px">
  <div style="font-size:28px;font-weight:800;letter-spacing:-1px;color:#ffffff">ochi<span style="color:#00FFC6">link</span></div>
  <div style="margin-top:10px;font-family:monospace;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#8fa3b8">${escapeHtml(eyebrow)}</div>
</td></tr>
<tr><td style="padding:34px">
  <h1 style="margin:0;font-size:30px;line-height:1.15;letter-spacing:-.7px;color:#0B0F1A">${escapeHtml(title)}</h1>
  <p style="margin:14px 0 26px;font-size:16px;line-height:1.65;color:#526174">${escapeHtml(intro)}</p>
  ${body}
  <div style="margin-top:28px">
    <a href="${safeCta}" style="display:inline-block;background:#00FFC6;color:#06231c;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px">${escapeHtml(ctaLabel)}</a>
  </div>
  <p style="margin:30px 0 0;font-size:12px;line-height:1.6;color:#8693a3">${footer}</p>
</td></tr>
<tr><td style="background:#0B0F1A;padding:20px 34px;font-size:12px;line-height:1.6;color:#8fa3b8">
  Ochilink · Secure by design. Caribbean by heart.<br>
  <a href="https://ochilink.com" style="color:#00FFC6;text-decoration:none">ochilink.com</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function row(label, value, accent = false) {
    return `<tr>
<td style="padding:11px 0;border-bottom:1px solid #e8ecef;font-size:13px;color:#738092">${escapeHtml(label)}</td>
<td align="right" style="padding:11px 0;border-bottom:1px solid #e8ecef;font-size:14px;font-weight:700;color:${accent ? '#008f72' : '#17212f'}">${escapeHtml(value)}</td>
</tr>`;
}

export function bookingConfirmationHtml({
    date,
    durationMinutes,
    amount,
    currency,
    reference,
    bookingUrl = 'https://ochilink.com/booking',
}) {
    const body = `
<div style="border:1px solid #dfe6ea;border-radius:14px;padding:20px;background:#fbfcfd">
  <div style="font-family:monospace;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#008f72;margin-bottom:10px">Booking summary</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    ${row('Date & time', date)}
    ${row('Duration', `${durationMinutes} minutes`)}
    ${row('Amount paid', `${currency.toUpperCase()} ${amount}`, true)}
    ${row('Reference', reference)}
  </table>
</div>
<div style="margin-top:18px;padding:16px 18px;border-radius:12px;background:#effff9;color:#174b40;font-size:14px;line-height:1.6">
  Your session is confirmed and the selected time is reserved for you.
</div>`;
    return shell({
        eyebrow: 'Booking confirmed',
        title: 'Your Ochilink session is confirmed.',
        intro: 'Your payment was verified successfully. Here are the details for your upcoming consultation.',
        body,
        ctaLabel: 'View booking',
        ctaUrl: bookingUrl,
        footer: 'Need to make a change? Reply to this email or contact Ochilink before your scheduled session.',
    });
}

export function paymentReceivedHtml({
    amount,
    currency,
    reference,
    siteUrl = 'https://ochilink.com',
}) {
    const body = `
<div style="border:1px solid #dfe6ea;border-radius:14px;padding:20px;background:#fbfcfd">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    ${row('Payment received', `${currency.toUpperCase()} ${amount}`, true)}
    ${row('Reference', reference)}
  </table>
</div>`;
    return shell({
        eyebrow: 'Payment received',
        title: 'We received your payment.',
        intro: 'Your Ochilink payment was verified successfully.',
        body,
        ctaLabel: 'Visit Ochilink',
        ctaUrl: siteUrl,
        footer: 'Keep this email for your records.',
    });
}

export function adminPaidBookingHtml({
    clientEmail,
    date,
    durationMinutes,
    amount,
    currency,
    reference,
    adminUrl = 'https://ochilink.com/admin/',
}) {
    const body = `
<div style="border:1px solid #dfe6ea;border-radius:14px;padding:20px;background:#fbfcfd">
  <div style="font-family:monospace;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#008f72;margin-bottom:10px">Paid booking</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    ${row('Client', clientEmail)}
    ${row('Date & time', date)}
    ${row('Duration', `${durationMinutes} minutes`)}
    ${row('Amount', `${currency.toUpperCase()} ${amount}`, true)}
    ${row('Reference', reference)}
  </table>
</div>`;
    return shell({
        eyebrow: 'Admin notification',
        title: 'A paid booking is confirmed.',
        intro: 'A customer completed payment and the consultation has been scheduled.',
        body,
        ctaLabel: 'Open admin',
        ctaUrl: adminUrl,
        footer: 'Review the consultation record in Ochilink Admin for the latest client and scheduling details.',
    });
}

export async function queueMail(client, kind, to, subject, text, dedupeKey, html = null) {
    await client.query(
        `INSERT INTO hub_email_outbox(kind,payload_encrypted,dedupe_key) VALUES ($1,$2,$3)
        ON CONFLICT (dedupe_key) DO NOTHING`,
        [kind, seal(JSON.stringify({ to, subject, text, html })), dedupeKey],
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
                    ...(payload.html ? { html: payload.html } : {}),
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
