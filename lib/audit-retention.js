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

/**
 * Delete at most batchSize expired, unheld records from each source.
 * The transaction and row locks serialize competing cleanup attempts and
 * prevent a hold from being inserted between eligibility check and deletion.
 * Requires the investigation-hold and cleanup-history migration.
 */
export async function cleanupAuditRetention(pool, { retentionDays = 90, batchSize = 100 } = {}) {
    if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 3650)
        throw new RangeError('Invalid retention period');
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
        throw new RangeError('Invalid cleanup batch size');
    const client = await pool.connect();
    let begun = false;
    try {
        await client.query('BEGIN');
        begun = true;
        // Serialize cleanup with other cleanup workers and hold-management transactions.
        await client.query('SELECT pg_advisory_xact_lock(73419, 9)');
        const preview = await previewAuditRetention(client, { retentionDays });
        const { rows: [run] } = await client.query(`
            INSERT INTO public.hub_audit_cleanup_runs
              (mode, retention_days, security_eligible, error_eligible)
            VALUES ('delete', $1, $2, $3) RETURNING run_id
        `, [retentionDays, preview.security_auth_logs.eligible, preview.system_error_logs.eligible]);
        const deleted = {};
        for (const source of SOURCES) {
            const { rows } = await client.query(`
                WITH candidates AS (
                    SELECT l.${source.id} FROM public.${source.table} l
                    WHERE l.${source.date} < now() - ($1::int * interval '1 day')
                      AND NOT EXISTS (
                          SELECT 1 FROM public.hub_audit_investigation_holds h
                          WHERE h.source_table = $2 AND h.record_id = l.${source.id}
                            AND h.released_at IS NULL
                      )
                    ORDER BY l.${source.date}, l.${source.id}
                    LIMIT $3
                    FOR UPDATE OF l SKIP LOCKED
                ), removed AS (
                    DELETE FROM public.${source.table} l
                    USING candidates c WHERE l.${source.id} = c.${source.id}
                    RETURNING l.${source.id}
                ) SELECT count(*)::int AS count FROM removed
            `, [retentionDays, source.table, batchSize]);
            deleted[source.table] = rows[0].count;
        }
        await client.query(`
            UPDATE public.hub_audit_cleanup_runs
            SET security_deleted=$2,error_deleted=$3,status='succeeded',finished_at=now()
            WHERE run_id=$1
        `, [run.run_id, deleted.security_auth_logs, deleted.system_error_logs]);
        await client.query('COMMIT');
        begun = false;
        return { runId: run.run_id, retentionDays, batchSize, eligible: preview, deleted };
    } catch (error) {
        if (begun) await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
