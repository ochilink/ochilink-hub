import { getPool } from './_db.js';
import { createRentalCheckout, getRentalFees, rentalApplicationStatus } from '../lib/rental.js';

function json(res, status, payload) {
    res.status(status).json(payload);
}
function sameOrigin(req) {
    const origin = req.headers.origin;
    const site = process.env.PUBLIC_SITE_URL;
    if (!origin) return true;
    try { return new URL(origin).origin === new URL(site).origin; } catch { return false; }
}
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!sameOrigin(req)) return json(res, 403, { error: 'Origin not allowed.' });
    const pool = getPool();
    try {
        const action = String(req.query?.action || '');
        if (req.method === 'GET' && action === 'fees')
            return json(res, 200, await getRentalFees(pool));
        if (req.method === 'GET' && action === 'status')
            return json(res, 200, await rentalApplicationStatus(pool, req.query?.id, req.query?.access_token));
        if (req.method === 'POST' && action === 'submit') {
            const result = await createRentalCheckout(pool, req.body || {});
            return json(res, 201, result);
        }
        return json(res, 405, { error: 'Method not allowed.' });
    } catch (error) {
        console.error('Rental API failed', { code: error.code || 'RENTAL_API_FAILED' });
        return json(res, error.status || 500, { error: error.status ? error.message : 'Rental application request failed.' });
    }
}
