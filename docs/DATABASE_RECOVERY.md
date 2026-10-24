# Ochilink Hub Database Recovery Runbook

## Purpose

This runbook documents how to verify, recover, and test the Ochilink Hub PostgreSQL database without modifying Production unless an explicit recovery decision has been made.

Production database provider: Neon PostgreSQL.

Vercel currently has both `DATABASE_URL` and `POSTGRES_URL` configured for Production and Preview. Never paste or commit their values.

## Recovery principles

1. Treat Production as read-only during investigation.
2. Record the incident timestamp as precisely as possible.
3. Prefer an isolated Neon branch/snapshot for inspection and recovery testing.
4. Verify the recovered branch before moving or copying any data.
5. Do not repoint Production or overwrite live data without explicit authorization.
6. Keep the original Production branch available until recovery has been validated.
7. Never store database passwords, connection strings, Stripe secrets, or customer notes in GitHub issues or logs.

## Current migration history

The repository currently contains:

- `001_ochilink_hub.sql`
- `002_import_public_catalog.sql`
- `003_complete_hub.sql`
- `004_direct_booking.sql`
- `009_app_cover_images.sql`
- `010_full_ecosystem_catalog.sql`
- `011_normalize_extra_catalog_apps.sql`
- `012_inline_app_cover_images.sql`
- `013_high_res_app_cover_previews.sql`
- `014_rental_application.sql`
- `015_activate_rental_document_apps.sql`

Important exceptions:

- Migration 002 is an idempotent catalog import but does not insert a row into `hub_schema_migrations`.
- `database/008_live_smoke_test.sql` is a standalone optional smoke-test schema and is not part of the main migration folder.
- The numbering gaps do not by themselves prove that Production is missing schema changes.
- Migration 014 is schema-only and can be applied before feature activation.
- Migration 015 publishes the Rental Application and Document Storage catalog cards and must run only after the new Production code is deployed and verified.

Expected ledger entries for the currently tracked schema migrations are:

- `001_ochilink_hub`
- `003_complete_hub`
- `004_direct_booking`
- `009_app_cover_images`
- `010_full_ecosystem_catalog`
- `011_normalize_extra_catalog_apps`
- `012_inline_app_cover_images`
- `013_high_res_app_cover_previews`
- `014_rental_application`
- `015_activate_rental_document_apps`

Use `database/verify_migration_history.sql` for a read-only verification.

## Routine verification

Run these checks against the intended Neon database before any migration or recovery work:

1. Confirm the connected Vercel environment is the expected Production or Preview environment.
2. Confirm the database hostname/project/branch in Neon without copying the secret connection string.
3. Run `database/verify_migration_history.sql`.
4. Confirm the application health endpoint returns a successful database connection.
5. Confirm the public site and Admin login are operating normally.
6. Record the latest successful Production deployment SHA.

## Point-in-time recovery test

Neon supports recovery by creating a branch from a prior point in the retained database history.

For a safe recovery test:

1. Choose a timestamp within the configured Neon history-retention window.
2. Create a new Neon branch from that point in time.
3. Do not attach the new branch to Production.
4. Connect only with a temporary/read-only client if possible.
5. Run:
   - migration-history verification
   - table-count verification
   - targeted row/count checks for the affected feature
6. Compare the recovered branch with current Production.
7. Delete the temporary recovery branch after the test when it is no longer needed.

A recovery test is successful only when the restored branch contains the expected schema and data and Production was never modified.

## Incident recovery options

### Recover selected rows or tables

Use this when Production received valid writes after the incident and those writes must be preserved.

1. Create a point-in-time branch immediately before the incident.
2. Verify the recovered data.
3. Export only the required rows/table data from the recovery branch.
4. Review the intended merge/update statements before applying them to Production.
5. Apply changes in a transaction where practical.
6. Re-run application and migration verification.

### Revert the whole database branch

Use this only when reverting all Production state after a known point is acceptable.

1. Identify and verify the exact restore timestamp.
2. Create/preview the recovery branch.
3. Confirm what post-incident writes would be lost.
4. Obtain explicit authorization for the full rollback.
5. Use Neon branch restore/PITR according to the current Neon console workflow.
6. Verify application health immediately after cutover.
7. Preserve the former Production branch until validation is complete.

## Logical backup option

For an additional portable backup independent of Neon branch history, a PostgreSQL logical dump can be created with `pg_dump` from an authorized environment.

Recommended characteristics:

- custom format (`-Fc`)
- encrypted/controlled storage
- no credentials embedded in filenames or command history
- periodic restore test into a disposable database
- do not commit dump files to Git

A logical dump complements Neon point-in-time recovery; it does not replace testing the restore process.

## Restore-test checklist

A disposable restore/test database should confirm at minimum:

- required public tables exist
- expected migration ledger entries are present
- at least one administrator account exists
- published app records are readable
- consultation records are readable
- booking/payment tables are structurally valid
- rental application and fee tables are structurally valid
- customer account/session/magic-link tables are structurally valid
- customer folder/document metadata tables are structurally valid
- security/audit tables are readable
- no Production connection string is used by the test deployment

## Production guardrail

Do not perform any destructive recovery action from this runbook automatically. Investigation and isolated recovery-branch creation are separate from Production cutover. A Production restore, branch switch, bulk data replacement, or credential change requires explicit authorization.
