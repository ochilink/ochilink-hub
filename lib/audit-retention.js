// Read-only audit retention preview. Does not delete or modify records.
const SOURCES = [
    { table: 'security_auth_logs', id: 'log_id', date: 'timestamp' },
    { table: 'system_error_logs', id: 'id', date: 'created_at' },
];

export async function previewAuditRetention(pool, { retentionDays = 90 } = {}) {
    if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 3650) {
        throw new RangeError('retentionDays must be an integer between 30 and 3650');
    }
    const result = {};
    // Fail closed if the investigation-holds migration is missing or inaccessible.
    // Counts and cutoff are computed in PostgreSQL using one consistent timestamp.
    for (const source of SOURCES) {
        const { rows } = await pool.query(`
            WITH cutoff AS (SELECT now() - ($1::int * interval '1 day') AS at)
            SELECT
                count(*)::int AS expired,
                count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM public.hub_audit_investigation_holds h
                    WHERE h.source_table = $2
                      AND h.record_id = l.${source.id}
                      AND h.released_at IS NULL
                ))::int AS held,
                count(*) FILTER (WHERE NOT EXISTS (
                    SELECT 1 FROM public.hub_audit_investigation_holds h
                    WHERE h.source_table = $2
                      AND h.record_id = l.${source.id}
                      AND h.released_at IS NULL
                ))::int AS eligible
            FROM public.${source.table} l, cutoff
            WHERE l.${source.date} < cutoff.at
        `, [retentionDays, source.table]);
        result[source.table] = rows[0];
    }
    return { mode: 'dry_run', retentionDays, ...result };
}
