import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { cleanupAuditRetention } from '../lib/audit-retention.js';

test('bounded retention deletes only eligible rows and records counts', async () => {
  const db = new PGlite();
  const pool = { connect: async () => ({query:(sql,args)=>db.query(sql,args),release(){}}) };
  try {
    await db.exec(await readFile('database/migrations/001_ochilink_hub.sql','utf8'));
    await db.exec(await readFile('database/migrations/005_audit_retention_safeguards.sql','utf8'));
    const user = (await db.query("INSERT INTO users(email,password_hash,role) VALUES ('hold@example.test','unused','admin') RETURNING id")).rows[0];
    await db.query("INSERT INTO security_auth_logs(event_type,timestamp) SELECT 'OLD',now()-interval '120 days' FROM generate_series(1,4)");
    await db.query("INSERT INTO security_auth_logs(event_type,timestamp) VALUES ('NEW',now()-interval '1 day')");
    const held = (await db.query("SELECT log_id FROM security_auth_logs WHERE event_type='OLD' LIMIT 1")).rows[0];
    await db.query("INSERT INTO hub_audit_investigation_holds(source_table,record_id,reason,created_by) VALUES ('security_auth_logs',$1,'Investigation still active',$2)",[held.log_id,user.id]);
    await db.query("INSERT INTO system_error_logs(severity,service,message,created_at) SELECT 'ERROR','test','old',now()-interval '120 days' FROM generate_series(1,3)");
    const result = await cleanupAuditRetention(pool,{batchSize:2});
    assert.equal(result.deleted.security_auth_logs,2);
    assert.equal(result.deleted.system_error_logs,2);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM security_auth_logs WHERE log_id=$1",[held.log_id])).rows[0].n,1);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM security_auth_logs WHERE event_type='NEW'")).rows[0].n,1);
    const run = (await db.query("SELECT status,security_deleted,error_deleted FROM hub_audit_cleanup_runs")).rows[0];
    assert.deepEqual(run,{status:'succeeded',security_deleted:2,error_deleted:2});
  } finally { await db.close(); }
});

test('cleanup fails closed without holds schema and preserves audit records',async()=>{
 const db=new PGlite();
 const pool={connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})};
 try{
  await db.exec(await readFile('database/migrations/001_ochilink_hub.sql','utf8'));
  await db.query("INSERT INTO security_auth_logs(event_type,timestamp) VALUES ('OLD',now()-interval '120 days')");
  await assert.rejects(cleanupAuditRetention(pool));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM security_auth_logs')).rows[0].n,1);
  await assert.rejects(cleanupAuditRetention(pool,{batchSize:0}),RangeError);
 }finally{await db.close();}
});

test('cleanup rolls back deleted records if cleanup history update fails', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile('database/migrations/001_ochilink_hub.sql','utf8'));
    await db.exec(await readFile('database/migrations/005_audit_retention_safeguards.sql','utf8'));
    await db.query("INSERT INTO security_auth_logs(event_type,timestamp) VALUES ('OLD',now()-interval '120 days')");
    await db.query("INSERT INTO system_error_logs(severity,service,message,created_at) VALUES ('ERROR','test','old',now()-interval '120 days')");
    let injected = false;
    const pool = {
      connect: async () => ({
        async query(sql, args) {
          if (typeof sql === 'string' && sql.includes('UPDATE public.hub_audit_cleanup_runs')) {
            injected = true;
            throw new Error('simulated cleanup history failure');
          }
          return db.query(sql,args);
        },
        release() {},
      }),
    };
    await assert.rejects(cleanupAuditRetention(pool,{batchSize:1}),/simulated cleanup history failure/);
    assert.equal(injected,true);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM security_auth_logs')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM system_error_logs')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM hub_audit_cleanup_runs')).rows[0].n,0);
  } finally { await db.close(); }
});
