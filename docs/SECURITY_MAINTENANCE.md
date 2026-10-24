# Ochilink Hub Security Maintenance Baseline

## Purpose

This document records the current security-maintenance controls that must remain intact as Ochilink Hub evolves.

## Authentication and lockout

Current controls:

- Administrator login is required for protected Hub management actions.
- Unknown accounts still perform a real bcrypt comparison to reduce account-timing differences.
- Login throttling is database-backed.
- Per-IP login throttle: 30 attempts per hour bucket.
- Per-email login throttle: 10 attempts per hour bucket.
- Five failed password attempts lock the account for 15 minutes.
- Successful login resets failed-attempt and lockout state.
- Administrator unlock clears failed attempts and lockout state.
- Sessions are stored as SHA-256 token hashes.
- Session cookie is Secure, HttpOnly, SameSite=Strict.
- Session lifetime is 15 minutes.
- Logout revokes the active session.
- Role changes revoke sessions for the changed account.
- Changing the signed-in administrator's own role is blocked.

## MFA

Current controls:

- MFA is available only when APP_ENCRYPTION_KEY is configured.
- TOTP secrets are encrypted with AES-256-GCM.
- MFA enrollment requires the current password.
- Enrollment must be verified with a valid authenticator code before enable.
- Eight recovery codes are generated on enable.
- Recovery codes are stored only as hashes.
- Recovery codes are single-use.
- A TOTP time step cannot be reused.
- Login asks for MFA only after the password is accepted.
- Disabling MFA requires the current password plus a valid authenticator or recovery code.
- Enabling/disabling MFA revokes other sessions while retaining the current verified session.
- The MFA status endpoint exposes only:
  - enabled/disabled state
  - recovery-code count
  - configuration readiness
- MFA secrets and recovery hashes are never returned by the status endpoint.

## Audit and privacy

Security and authentication events are written to security_auth_logs.

Privacy safeguards:

- Raw client IP addresses are not stored in security audit metadata.
- When RATE_LIMIT_SECRET is configured, the client IP is converted to an HMAC hash.
- Browser family may be recorded.
- Full User-Agent strings are not retained in security audit metadata.
- Failed logins, MFA failures, rate-limit events, administrator actions, role changes, app changes, availability changes, and payment-related security events are audited where applicable.

## Scheduled cleanup and retention

The restricted maintenance endpoint is protected by CRON_SECRET and timing-safe comparison.

The current Vercel cron schedule invokes /api/maintenance daily at 08:00 UTC.

Current cleanup behavior includes:

- expired sessions: removed
- rate-limit windows older than 2 days: removed
- expired password-reset rows older than 1 day: removed
- expired pending MFA enrollment state: cleared
- expired unconfirmed consultation reservations: released
- analytics older than 90 days: removed
- security_auth_logs older than 90 days: removed
- system_error_logs older than 90 days: removed
- expired failed email payloads: scrubbed
- email outbox rows older than 90 days: removed

The 90-day audit/error retention period is a maintenance policy and should be reviewed if regulatory, operational, or incident-response requirements change.

## Production environment requirements

The following must remain configured as secrets/configuration in the appropriate Vercel environments:

- DATABASE_URL and/or POSTGRES_URL
- RATE_LIMIT_SECRET
- APP_ENCRYPTION_KEY
- CRON_SECRET
- RESEND_API_KEY and MAIL_FROM when email features are enabled
- Stripe keys and webhook secret for live payment operation

Never print, log, commit, or paste the secret values into tickets or documentation.

## Maintenance review checklist

At each security maintenance review:

1. Verify the current Production deployment is healthy.
2. Confirm RATE_LIMIT_SECRET, APP_ENCRYPTION_KEY, and CRON_SECRET are present without decrypting them.
3. Run the full Node regression suite.
4. Confirm the dependency security audit gate passes.
5. Review recent LOGIN_FAILED, MFA_FAILED, and RATE_LIMITED counts for unusual spikes.
6. Confirm the maintenance cron remains scheduled.
7. Confirm 90-day log cleanup statements are still present and tested.
8. Review active administrator accounts.
9. For each administrator, review MFA status from the authenticated Settings UI.
10. If recovery-code count is low, generate a new set by re-enrolling MFA according to the approved workflow.
11. Rotate provider/API secrets only when required and validate dependent flows afterward.

## Change guardrails

Any change to the following requires dedicated regression coverage:

- lockout threshold or duration
- IP/email rate-limit thresholds
- session lifetime or cookie attributes
- MFA encryption/storage
- TOTP replay protection
- recovery-code behavior
- audit metadata contents
- retention periods
- CRON_SECRET protection
- administrator role protections

Do not weaken these controls as part of unrelated feature work.
