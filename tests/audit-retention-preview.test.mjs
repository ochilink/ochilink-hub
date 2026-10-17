import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { previewAuditRetention } from '../lib/audit-retention.js';

test('dry-run retention reports zero for empty tables without writing', async () => {
    const db = new PGlite();
    try {
        await db.exec(await readFile('database/migrations/001_ochilink_hub.sql', 'utf8'));
        await db.exec(await readFile('database/migrations/005_audit_retention_safeguards.sql', 'utf8'));
        const preview = await previewAuditRetention(db);
        assert.equal(preview.mode, 'dry_run');
        assert.equal(preview.retentionDays, 90);
        for (const table of ['security_auth_logs', 'system_error_logs']) {
            assert.deepEqual(preview[table], { expired: 0, held: 0, eligible: 0 });
        }
        const runs = await db.query('SELECT count(*)::int AS n FROM hub_audit_cleanup_runs');
        assert.equal(runs.rows[0].n, 0);
    } finally {
        await db.close();
    }
});

test('dry-run retention excludes active holds and newer records without deleting', async () => {
    const db = new PGlite();
    try {
        await db.exec(await readFile('database/migrations/001_ochilink_hub.sql', 'utf8'));
        await db.exec(await readFile('database/migrations/005_audit_retention_safeguards.sql', 'utf8'));
        const { rows: [admin] } = await db.query(
            "INSERT INTO users(email,password_hash,role) VALUES ('retention@example.test','unused','admin') RETURNING id"
        );
        const oldAudit = await db.query(
            "INSERT INTO security_auth_logs(event_type,timestamp) VALUES ('OLD',now()-interval '120 days') RETURNING log_id"
        );
        await db.query(
            "INSERT INTO security_auth_logs(event_type,timestamp) VALUES ('HELD',now()-interval '120 days'),('NEW',now()-interval '2 days')"
        );
        const heldAudit = await db.query(
            "SELECT log_id FROM security_auth_logs WHERE event_type='HELD'"
        );
        await db.query(
            "INSERT INTO hub_audit_investigation_holds(source_table,record_id,reason,created_by) VALUES ('security_auth_logs',$1,'Active incident under review',$2)",
            [heldAudit.rows[0].log_id, admin.id]
        );
        await db.query(
            "INSERT INTO system_error_logs(severity,service,message,created_at) VALUES ('ERROR','test','old',now()-interval '120 days'),('ERROR','test','new',now()-interval '2 days')"
        );
        const preview = await previewAuditRetention(db);
        assert.deepEqual(preview.security_auth_logs, { expired: 2, held: 1, eligible: 1 });
        assert.deepEqual(preview.system_error_logs, { expired: 1, held: 0, eligible: 1 });
        assert.equal((await db.query('SELECT count(*)::int AS n FROM security_auth_logs')).rows[0].n, 3);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM system_error_logs')).rows[0].n, 2);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM hub_audit_cleanup_runs')).rows[0].n, 0);
        assert.ok(oldAudit.rows[0].log_id);
        await assert.rejects(previewAuditRetention(db, { retentionDays: 0 }), RangeError);
        await assert.rejects(previewAuditRetention(db, { retentionDays: 90.5 }), RangeError);
    } finally {
        await db.close();
    }
});

test('dry-run retention fails closed if investigation-hold schema is missing', async () => {
    const db = new PGlite();
    try {
        await db.exec(await readFile('database/migrations/001_ochilink_hub.sql', 'utf8'));
        await assert.rejects(previewAuditRetention(db));
        assert.equal((await db.query('SELECT count(*)::int AS n FROM security_auth_logs')).rows[0].n, 0);
    } finally {
        await db.close();
    }
});
