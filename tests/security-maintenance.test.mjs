import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('security maintenance baseline preserves retention and cron protections', () => {
  const maintenance = fs.readFileSync(
    new URL('../api/maintenance.js', import.meta.url),
    'utf8',
  );
  const hub = fs.readFileSync(
    new URL('../api/hub.js', import.meta.url),
    'utf8',
  );
  const features = fs.readFileSync(
    new URL('../lib/features.js', import.meta.url),
    'utf8',
  );
  const security = fs.readFileSync(
    new URL('../lib/security.js', import.meta.url),
    'utf8',
  );
  const vercel = fs.readFileSync(
    new URL('../vercel.json', import.meta.url),
    'utf8',
  );

  assert.match(maintenance, /CRON_SECRET/);
  assert.match(maintenance, /timingSafeEqual/);
  assert.match(
    maintenance,
    /DELETE FROM security_auth_logs WHERE timestamp<now\(\)-interval '90 days'/,
  );
  assert.match(
    maintenance,
    /DELETE FROM system_error_logs WHERE created_at<now\(\)-interval '90 days'/,
  );
  assert.match(
    maintenance,
    /DELETE FROM hub_rate_limits WHERE window_start<now\(\)-interval '2 days'/,
  );
  assert.match(vercel, /"path": "\/api\/maintenance"/);
  assert.match(vercel, /"schedule": "0 8 \* \* \*"/);

  assert.match(hub, /failed_attempts\+1>=5/);
  assert.match(hub, /interval '15 minutes'/);
  assert.match(hub, /SameSite=Strict/);
  assert.match(hub, /HttpOnly/);
  assert.match(hub, /Secure/);

  assert.match(features, /recovery_codes_remaining/);
  assert.match(features, /MFA_ENABLED/);
  assert.match(features, /MFA_DISABLED/);
  assert.match(features, /mfa_recovery_hashes/);

  assert.match(security, /aes-256-gcm/);
  assert.match(security, /timingSafeEqual/);
  assert.match(security, /current > Number\(last\)/);
});

test('security maintenance documentation records current guardrails', () => {
  const doc = fs.readFileSync(
    new URL('../docs/SECURITY_MAINTENANCE.md', import.meta.url),
    'utf8',
  );

  assert.match(doc, /Five failed password attempts lock the account for 15 minutes/);
  assert.match(doc, /Eight recovery codes/);
  assert.match(doc, /90 days/);
  assert.match(doc, /Raw client IP addresses are not stored/);
  assert.match(doc, /Do not weaken these controls/);
});
