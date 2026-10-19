import { createHash } from 'node:crypto';
import { getPool } from './_db.js';
import { stripeClient } from '../lib/payments.js';

// Disabled by default. This route is not part of public consultation pricing.
export function smokeTestEnabled(env = process.env) {
  return env.VERCEL_ENV === 'production' &&
    env.ADMIN_LIVE_SMOKE_TEST_ENABLED === 'true' &&
    typeof env.STRIPE_SECRET_KEY === 'string' &&
    env.STRIPE_SECRET_KEY.startsWith('sk_live_') &&
    !!env.STRIPE_WEBHOOK_SECRET;
}

export function createSmokeTestHandler({ poolProvider = getPool, stripeProvider = stripeClient, env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (!smokeTestEnabled(env)) return res.status(404).json({ error: 'Not found.' });
    if (!req.headers?.host || req.headers.origin !== 'https://' + req.headers.host)
      return res.status(403).json({ error: 'Invalid origin.' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json'))
      return res.status(415).json({ error: 'JSON required.' });
    if (JSON.stringify(req.body || {}).length > 2 || Object.keys(req.body || {}).length !== 0)
      return res.status(400).json({ error: 'Unexpected request fields.' });
    const token = String(req.headers.cookie || '').match(/(?:^|;\s*)ochi_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    const pool = poolProvider();
    let client;
    try {
      const auth = await pool.query(
        `SELECT u.id FROM hub_sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active AND u.role='admin'`,
        [createHash('sha256').update(token).digest('hex')],
      );
      if (!auth.rows.length) return res.status(403).json({ error: 'Administrator required.' });
      // Reserve the single-use identity durably before any external Stripe call.
      // If Stripe succeeds but the database write fails, retry the SAME idempotency key.
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO hub_live_smoke_tests(actor_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [auth.rows[0].id],
      );
      const reserved = (await client.query(
        `SELECT id,actor_id,state,checkout_url FROM hub_live_smoke_tests LIMIT 1`,
      )).rows[0];
      if (!reserved || reserved.actor_id !== auth.rows[0].id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Smoke test reserved for another administrator.' });
      }
      await client.query('COMMIT');
      await client.query('BEGIN');
      const row = (await client.query(
        `SELECT id,actor_id,state,checkout_url FROM hub_live_smoke_tests WHERE id=$1 FOR UPDATE`,
        [reserved.id],
      )).rows[0];
      if (!row || row.actor_id !== auth.rows[0].id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Administrator required.' });
      }
      if (row.state === 'checkout_open') {
        await client.query('COMMIT');
        return res.status(200).json({ checkout_url: row.checkout_url });
      }
      if (row.state !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The one-time smoke test has already finished.' });
      }
      const id = row.id;
      const session = await stripeProvider().checkout.sessions.create({
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: {
          currency: 'usd', unit_amount: 100,
          product_data: { name: 'Ochilink internal payment verification (not a booking)' },
        } }],
        metadata: { ochilink_smoke_test_id: id },
        payment_intent_data: { metadata: { ochilink_smoke_test_id: id } },
        success_url: 'https://' + req.headers.host + '/admin?smoke_test=returned',
        cancel_url: 'https://' + req.headers.host + '/admin?smoke_test=cancelled',
      }, { idempotencyKey: 'ochilink-live-smoke-' + id });
      if (!session.id || !session.url) throw new Error('INVALID_STRIPE_CHECKOUT');
      await client.query(
        `UPDATE hub_live_smoke_tests SET stripe_session_id=$2,checkout_url=$3,state='checkout_open',updated_at=now() WHERE id=$1`,
        [id, session.id, session.url],
      );
      await client.query(
        `INSERT INTO security_auth_logs(actor_id,event_type,metadata)
         VALUES ($1,'LIVE_SMOKE_CHECKOUT_CREATED',$2)`,
        [auth.rows[0].id, { smoke_test_id: id }],
      );
      await client.query('COMMIT');
      return res.status(201).json({ checkout_url: session.url });
    } catch (error) {
      if (client) { try { await client.query('ROLLBACK'); } catch {} }
      console.error('Live smoke checkout failed', { code: 'LIVE_SMOKE_CHECKOUT_FAILED' });
      return res.status(503).json({ error: 'Live smoke checkout unavailable.' });
    } finally {
      client?.release();
    }
  };
}
export default createSmokeTestHandler();
