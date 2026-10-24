-- Normalize the two existing Ochilink ecosystem products preserved from Production.
BEGIN;

UPDATE public.apps
SET name = 'Home Value',
    description = 'Home-value request app where users submit a property address to receive an estimated home value.',
    tech = ARRAY['Web App','Real Estate','Database TBD'],
    status = 'Coming Soon',
    is_published = true,
    sort_order = 25,
    updated_at = now()
WHERE slug = 'home-value';

UPDATE public.apps
SET name = 'Real Estate Directory',
    description = 'Community and real-estate directory for association information, community rules and regulations.',
    tech = ARRAY['React','Real Estate','Directory','Database TBD'],
    status = 'Coming Soon',
    is_published = true,
    sort_order = 26,
    updated_at = now()
WHERE slug = 'real-estate-directory';

INSERT INTO public.hub_schema_migrations (version)
VALUES ('011_normalize_extra_catalog_apps')
ON CONFLICT (version) DO NOTHING;

COMMIT;
