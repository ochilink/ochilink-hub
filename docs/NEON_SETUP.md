# Ochilink Hub database setup

This prepares storage only. The current demo interface is not yet connected to these tables.

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

Existing apps and content will be imported from the current landing page during API integration. The configured pricing matches the current site: USD 75/hour and USD 150 minimum. No fitness tables are included.

The setup is transactional and uses IF NOT EXISTS; rerunning it preserves records. It does not repair pre-existing incompatible tables. If it fails, retain the error and inspect the existing schema before changing tables. Do not run the older fitness schema or schema-additions.sql for this setup.

Live Neon execution and end-to-end login remain to be verified. The migration creates storage for future protections; it does not implement those protections by itself.
