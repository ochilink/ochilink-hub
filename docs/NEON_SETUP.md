# Ochilink Hub database setup

The migrations prepare storage used by the dynamic Hub interface in this branch.

1. In Vercel, open the Ochilink Hub project and check which Neon database is connected through DATABASE_URL or POSTGRES_URL. Do not copy its value into chat.
2. In Neon, select that exact project, branch and database. The screenshot showed an empty public schema in neondb; confirm this is the connected database.
3. Open SQL Editor. Paste the complete contents of database/migrations/001_ochilink_hub.sql and run it.
4. Verify with the read-only query below:

    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;

Expected tables: apps, consultations, hub_rate_limits, hub_schema_migrations, hub_sessions, security_auth_logs, site_settings, system_error_logs, users.

No users or passwords are seeded. Admin provisioning must hash a privately chosen password with bcrypt; never insert a plaintext password. Public registration must always assign customer, regardless of request input. The API must enforce admin permissions for app/settings/user management and log changes server-side. Sessions should use secure HttpOnly cookies with origin/CSRF checks, expiry and logout revocation. Login throttling must use the shared database rather than process memory.

Existing apps are imported from the current landing page by migration 002. The configured pricing matches the current site: USD 75/hour and USD 150 minimum. No fitness tables are included.

The setup is transactional and uses IF NOT EXISTS; rerunning it preserves records. It does not repair pre-existing incompatible tables. If it fails, retain the error and inspect the existing schema before changing tables. Do not run the older fitness schema or schema-additions.sql for this setup.

The initial Neon migration was confirmed successful by the user. Live deployed login remains to be verified. The migration alone does not implement access controls; those are enforced by the Hub API in this branch.

## Connect the dynamic website

The first migration has been confirmed successful by the user in Neon. Complete these remaining steps before merging/deploying the integration:

1. In the same Neon SQL Editor, run database/migrations/002_import_public_catalog.sql. It imports the 12 existing non-fitness landing-page entries, retaining their original copy. It does not overwrite existing records. Entries without real HTTPS destinations can be corrected in Admin.
2. In Vercel → Ochilink Hub → Settings → Environment Variables, confirm DATABASE_URL or POSTGRES_URL refers to this database. Enable it for the deployment environments being used. Prefer the Neon pooled connection string. Never send the value in chat.
3. Add RATE_LIMIT_SECRET to Vercel for the same environments. Generate a private value locally with: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))". This is separate from a user password. JWT_SECRET is no longer used by Hub authentication.
4. Create the first real admin locally using the instructions below. No default password is supplied.
5. Merge the reviewed integration PR and let Vercel deploy it. Existing immutable deployment URLs keep serving their old deployment; test the new deployment URL or the production domain assigned to it.
6. Open /api/health on the new deployment; expect HTTP 200 with db connected. Open /admin and sign in. Add an unpublished app; verify it is hidden publicly. Publish it, refresh the public page, confirm it appears, then delete the test app. Check the Security tab for the audit entries.
7. Submit a consultation request and check the Consultations tab. A request is not a confirmed appointment, payment or email notification.

### Create your first administrator (Windows PowerShell)

Run these commands one at a time in a local folder where you want the project:

    git clone --branch codex/ochilink-database-foundation https://github.com/ochilink/ochilink-hub.git
    cd ochilink-hub
    npm ci
    npm run create-admin

The script asks for your email and a hidden password of at least 14 characters. It prints an INSERT statement containing a bcrypt hash, never your password. Copy that generated SQL into the same Neon SQL Editor and run it. It creates an admin only when none already exists. If a user with that email already exists, it leaves that user unchanged. Do not insert a plaintext password or post the generated SQL publicly.

The helper branch name above is valid while this draft PR is open; after merging, cloning the default branch is sufficient.

### Verification and limits

Automated tests execute both migrations twice against embedded PostgreSQL (PGlite), test real handler requests and render both bundled React pages in jsdom. They cover session expiry/revocation, authorization, rate limiting, app publication/CRUD, pricing, consultation requests, error states and form wiring. These tests do not establish connectivity to your Neon/Vercel deployment. Full-browser visual verification is pending because the browser download was unavailable in the build environment.

The original administrator layout now supports audited user role changes and unlocking. Changing your own administrator role is blocked; role changes revoke that user’s sessions. Consultation details remain read-only. The API includes consultation status updates, but the UI does not expose scheduling yet. The follow-up complete-sections branch implements password recovery, MFA, visitor analytics, payments, transactional emails and scheduled cleanup. See FEATURE_ACTIVATION.md for migration 003 and required private service settings. Public registration and outbound threat-alert delivery remain separate features.

Expired sessions and old rate-limit windows should be pruned through a restricted maintenance task. The complete-sections maintenance task uses 90-day audit/error retention; review that policy before production use. Never record passwords, tokens, raw connection strings or client consultation notes in logs.
