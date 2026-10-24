-- Ochilink Hub migration-history verification.
-- READ ONLY: this file performs SELECT statements only.

WITH expected(version) AS (
    VALUES
        ('001_ochilink_hub'),
        ('003_complete_hub'),
        ('004_direct_booking'),
        ('009_app_cover_images'),
        ('010_full_ecosystem_catalog'),
        ('011_normalize_extra_catalog_apps'),
        ('012_inline_app_cover_images'),
        ('013_high_res_app_cover_previews'),
        ('014_rental_application'),
        ('015_activate_rental_document_apps')
),
applied AS (
    SELECT version, applied_at
    FROM public.hub_schema_migrations
)
SELECT
    e.version,
    CASE WHEN a.version IS NULL THEN 'MISSING' ELSE 'APPLIED' END AS status,
    a.applied_at
FROM expected e
LEFT JOIN applied a USING (version)
ORDER BY e.version;

-- Also show ledger entries that are not in the expected tracked set.
WITH expected(version) AS (
    VALUES
        ('001_ochilink_hub'),
        ('003_complete_hub'),
        ('004_direct_booking'),
        ('009_app_cover_images'),
        ('010_full_ecosystem_catalog'),
        ('011_normalize_extra_catalog_apps'),
        ('012_inline_app_cover_images'),
        ('013_high_res_app_cover_previews'),
        ('014_rental_application'),
        ('015_activate_rental_document_apps')
)
SELECT m.version, m.applied_at
FROM public.hub_schema_migrations m
LEFT JOIN expected e USING (version)
WHERE e.version IS NULL
ORDER BY m.applied_at, m.version;
