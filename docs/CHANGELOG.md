# Changelog

## 2026-10-15

- Added the initial Ochilink Hub PostgreSQL migration for users, app catalog, consultations, pricing/settings, audit/error logs, sessions and shared rate-limit counters.
- Added Neon setup and verification instructions. No demo accounts, fitness tables or destructive statements are included.
- Website/API integration and execution against Neon remain pending.

- Connected the public catalog, counts and pricing to PostgreSQL with loading/error/empty states.
- Replaced demo admin login/data with real authentication, database sessions, account throttling/lockout, audited app CRUD and pricing management.
- Added real users/audit/errors/consultation lists and a persistent public consultation request form.
- Added a repeatable import of existing non-fitness catalog entries and a hidden-password first-admin SQL helper.
- Disabled out-of-scope fitness/tracking sample endpoints, fixed API routing, removed unsafe demo fallbacks and raw error responses, and enabled verified remote database TLS.
- Added 14 passing database/React DOM integration tests. Live deployment and browser visual checks remain pending.

- Restored the original login/admin markup and unchanged original stylesheet after user feedback. Kept the original two-column login, sidebar/navigation, dashboard cards, tables, themes and app modal, connecting their controls through a data-only React hook.
- Removed the replacement admin stylesheet. Added server-backed role/unlock controls and real seven-day audit counts/totals for the existing dashboard. Disabled unsupported demo-only features instead of claiming they are active.
- Added regression checks for the original stylesheet/layout and the restored user controls.

## Complete Hub sections (pending activation)

- Matched the navbar Login button to the supplied reference, placed after Schedule, and removed the navbar email.

- Added Admin Login links to desktop and mobile landing-page navigation.

- Separated the MFA setup secret and authenticator link onto distinct lines with explicit spacing.

- Wired consent-based visitor analytics to the original Analytics tabs; added DNT/GPC suppression and retention.
- Added hashed/single-use password recovery with encrypted transactional email and session revocation.
- Added encrypted TOTP MFA enrollment, verification, replay prevention, one-use recovery codes and safe disable.
- Added timezone-aware availability slots, temporary reservations, conflict checks and consultation editing/scheduling.
- Added an encrypted Resend outbox with immediate sends, idempotent retries, status/retry controls and protected maintenance.
- Added server-quoted Stripe Checkout links, raw-body signed webhooks, deduplication, refund synchronization and net paid totals.
- Preserved the original complete login/admin stylesheet and existing layout components. Added matching controls within the existing sections.
- Added migration 003 and FEATURE_ACTIVATION.md. External service activation and live acceptance testing remain pending; no real emails or charges were made.
