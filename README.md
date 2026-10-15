# Ochilink Hub

React landing page and admin interface, Node.js Vercel Functions, and Neon PostgreSQL.

## Setup

See docs/NEON_SETUP.md for the database, first administrator, environment variables and deployment checklist.

## Commands

- npm ci
- npm test
- npm run create-admin

## Dynamic features

- Public app catalog, published counts, search/filter and consultation pricing.
- Admin login using bcrypt and revocable, hashed database sessions in secure HttpOnly cookies.
- Shared login/request throttling, account lockout and server-side admin authorization.
- App create/edit/publish/delete and pricing changes with transactional audit logs.
- Consultation requests stored in PostgreSQL; administrator can review client details.
- Original login and admin layouts/styles retained; original controls are wired to server actions.
- User role and account unlock controls, with audit records and role-change session revocation.
- Real user, consultation, audit and error record lists. Empty databases show empty states.

See docs/FEATURE_ACTIVATION.md for the additional sections, migration 003, private service credentials and acceptance checks.

No demo credentials or simulated dashboard statistics are used. Fitness APIs are disabled for this phase. Public account registration is not implemented. Recovery/email, authenticator MFA, payments, availability and consultation editing are implemented in the complete-sections branch and require the service setup in docs/FEATURE_ACTIVATION.md.

## Endpoints

- GET /api/health
- GET /api/hub?resource=public
- POST /api/hub?resource=consultations
- POST /api/hub?resource=login (also /api/auth/login)
- GET /api/hub?resource=session
- POST /api/hub?resource=logout
- GET /api/hub?resource=admin (admin only)
- POST/PUT/DELETE /api/hub?resource=apps (admin only)
- PUT /api/hub?resource=pricing (admin only)
- PUT /api/hub?resource=consultations (admin only)

Mutations require same-origin HTTPS requests with JSON. Secrets remain in Vercel; they must never be embedded in public HTML.

## Additional section endpoints

The /api/hub resource parameter also supports recovery, reset-password, mfa, availability, availability-admin, analytics, analytics-admin, consultation-admin, payment-link, payment-details, checkout and email-outbox. Authentication/origin requirements are enforced per action. Stripe events use /api/stripe-webhook; authenticated maintenance uses /api/maintenance. See FEATURE_ACTIVATION.md before activating services.
