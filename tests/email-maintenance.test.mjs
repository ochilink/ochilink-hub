import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('email maintenance baseline preserves outbox retry and expiry safeguards', () => {
  const mail = fs.readFileSync(new URL('../lib/mail.js', import.meta.url), 'utf8');
  const maintenance = fs.readFileSync(new URL('../api/maintenance.js', import.meta.url), 'utf8');

  assert.match(mail, /RESEND_API_KEY/);
  assert.match(mail, /MAIL_FROM/);
  assert.match(mail, /seal\(JSON\.stringify/);
  assert.match(mail, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.match(mail, /FOR UPDATE SKIP LOCKED/);
  assert.match(mail, /interval '5 minutes'/);
  assert.match(mail, /attempts >= 10 \? 'failed' : 'pending'/);
  assert.match(mail, /created_at>now\(\)-interval '23 hours'/);
  assert.match(mail, /RESET_EXPIRED/);
  assert.match(mail, /30 \* 60000/);
  assert.match(mail, /AbortSignal\.timeout\(8000\)/);
  assert.match(mail, /Idempotency-Key/);
  assert.match(mail, /payload_encrypted=''/);
  assert.match(mail, /escapeHtml/);
  assert.match(mail, /#0B0F1A/);
  assert.match(mail, /#00FFC6/);

  assert.match(maintenance, /last_error='EXPIRED'/);
  assert.match(maintenance, /created_at<now\(\)-interval '23 hours'/);
  assert.match(maintenance, /DELETE FROM hub_email_outbox WHERE created_at<now\(\)-interval '90 days'/);
  assert.match(maintenance, /flushMail/);
  assert.match(maintenance, /CRON_SECRET/);
});

test('email maintenance documentation records current guardrails', () => {
  const doc = fs.readFileSync(new URL('../docs/EMAIL_MAINTENANCE.md', import.meta.url), 'utf8');
  assert.match(doc, /five minutes/);
  assert.match(doc, /ten attempts/);
  assert.match(doc, /30 minutes/);
  assert.match(doc, /23 hours/);
  assert.match(doc, /provider accepted it/);
  assert.match(doc, /Do not weaken these controls/);
});
