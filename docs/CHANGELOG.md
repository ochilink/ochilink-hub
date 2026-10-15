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
