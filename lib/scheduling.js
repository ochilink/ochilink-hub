export const uuidPattern =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export async function reserveSlot(client, slotId, excludeId = null) {
    // One calendar for Ochilink; serialize availability/booking changes to prevent races.
    await client.query(
        'LOCK TABLE hub_availability IN SHARE ROW EXCLUSIVE MODE',
    );
    const slot = (
        await client.query(
            'SELECT * FROM hub_availability WHERE id=$1 AND is_enabled AND starts_at>now() FOR UPDATE',
            [slotId],
        )
    ).rows[0];
    if (!slot)
        throw Object.assign(
            new Error('This appointment slot is no longer available.'),
            { status: 409 },
        );
    const conflict = (
        await client.query(
            `SELECT id FROM consultations WHERE id IS DISTINCT FROM $1::uuid
        AND scheduled_at<$2 AND scheduled_at+(duration_minutes*interval '1 minute')>$3
        AND (status='Scheduled' OR (status='Requested' AND (reserved_until>now() OR (checkout_required AND EXISTS (SELECT 1 FROM hub_payments hp WHERE hp.consultation_id=consultations.id AND hp.state='pending'))))) LIMIT 1`,
            [excludeId, slot.ends_at, slot.starts_at],
        )
    ).rows[0];
    if (conflict)
        throw Object.assign(
            new Error(
                'This appointment slot was just reserved. Choose another.',
            ),
            { status: 409 },
        );
    return slot;
}
export async function availableSlots(pool) {
    return (
        await pool.query(`SELECT s.id,s.starts_at,s.ends_at FROM hub_availability s WHERE is_enabled AND starts_at>now()
        AND starts_at<now()+interval '90 days' AND NOT EXISTS (
            SELECT 1 FROM consultations c WHERE c.scheduled_at<s.ends_at
            AND c.scheduled_at+(c.duration_minutes*interval '1 minute')>s.starts_at
            AND (c.status='Scheduled' OR (c.status='Requested' AND (c.reserved_until>now() OR (c.checkout_required AND EXISTS (SELECT 1 FROM hub_payments hp WHERE hp.consultation_id=c.id AND hp.state='pending')))))
        ) ORDER BY starts_at LIMIT 300`)
    ).rows;
}
