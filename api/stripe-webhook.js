import { getPool } from './_db.js';
import { stripeClient, processPaymentEvent } from '../lib/payments.js';
import { flushMail } from '../lib/mail.js';
export const config = { api: { bodyParser: false } };
export function createWebhookHandler(
    poolProvider = getPool,
    stripeProvider = stripeClient,
) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'POST')
            return res.status(405).json({ error: 'Method not allowed.' });
        if (
            !process.env.STRIPE_WEBHOOK_SECRET ||
            !process.env.STRIPE_SECRET_KEY
        )
            return res
                .status(503)
                .json({ error: 'Webhook is not configured.' });
        let event;
        try {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
                size += Buffer.byteLength(chunk);
                if (size > 1048576) return res.status(413).end();
                chunks.push(Buffer.from(chunk));
            }
            event = stripeProvider().webhooks.constructEvent(
                Buffer.concat(chunks),
                req.headers['stripe-signature'],
                process.env.STRIPE_WEBHOOK_SECRET,
            );
        } catch {
            return res
                .status(400)
                .json({ error: 'Invalid webhook signature.' });
        }
        const pool = poolProvider(),
            client = await pool.connect();
        try {
            await client.query('BEGIN');
            await processPaymentEvent(client, event, stripeProvider());
            await client.query('COMMIT');
            await flushMail(pool, { limit: 2 });
            return res.json({ received: true });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Payment webhook failed', {
                code: error.code || 'PAYMENT_PROCESSING_FAILED',
            });
            return res
                .status(500)
                .json({ error: 'Webhook processing failed. Retry required.' });
        } finally {
            client.release();
        }
    };
}
export default createWebhookHandler();
