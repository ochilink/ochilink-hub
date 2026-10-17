import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('audit retention migration is repeatable and enforces investigation holds', async () => {
    const db = new PGlite();
    try {
        const base = await readFile('database/migrations/001_ochilink_hub.sql', 'utf8');
        const migration = await readFile('database/migrations/005_audit_retention_safeguards.sql', 'utf8');
        await db.exec(base);
        await db.exec(migration);
        await db.exec(migration);

        const { rows: tables } = await db.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema='public'
              AND table_name IN ('hub_audit_investigation_holds','hub_audit_cleanup_runs')
            ORDER BY table_name
        `);
        assert.equal(tables.length, 2);

        const user = await db.query(`
            INSERT INTO public.users(email,password_hash,role)
            VALUES ('retention-test@example.test','unused','admin')
            RETURNING id
        `);
        const userId = user.rows[0].id;
        const recordId = '11111111-1111-4111-8111-111111111111';
        await db.query(`
            INSERT INTO public.hub_audit_investigation_holds
              (source_table,record_id,reason,created_by)
            VALUES ('security_auth_logs',$1,'Active security investigation',$2)
        `, [recordId, userId]);

        await assert.rejects(
            db.query(`
                INSERT INTO public.hub_audit_investigation_holds
                  (source_table,record_id,reason,created_by)
                VALUES ('security_auth_logs',$1,'Duplicate active investigation',$2)
            `, [recordId, userId]),
        );

        const held = await db.query(`
            SELECT count(*)::int AS count FROM public.hub_audit_investigation_holds
            WHERE source_table='security_auth_logs' AND record_id=$1 AND released_at IS NULL
        `, [recordId]);
        assert.equal(held.rows[0].count, 1);

        await db.query(`
            INSERT INTO public.hub_audit_cleanup_runs
              (mode,retention_days,security_eligible,error_eligible)
            VALUES ('dry_run',90,3,1)
        `);
        const runs = await db.query(`
            SELECT mode,retention_days,security_deleted,error_deleted
            FROM public.hub_audit_cleanup_runs
        `);
        assert.equal(runs.rows[0].mode, 'dry_run');
        assert.equal(runs.rows[0].retention_days, 90);
        assert.equal(runs.rows[0].security_deleted, 0);
        assert.equal(runs.rows[0].error_deleted, 0);
        await assert.rejects(db.query(`
            INSERT INTO public.hub_audit_cleanup_runs(mode,retention_days)
            VALUES ('delete',0)
        `));
    } finally {
        await db.close();
    }
});
