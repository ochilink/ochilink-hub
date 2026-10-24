-- Normalize and preserve the two additional official Ochilink ecosystem products.
BEGIN;

INSERT INTO public.apps
    (slug,name,description,link,tech,status,is_published,sort_order)
VALUES
(
    'home-value',
    'Home Value',
    'Home-value request app where users submit a property address to receive an estimated home value.',
    NULL,
    ARRAY['Web App','Real Estate','Database TBD'],
    'Coming Soon',
    true,
    25
),
(
    'real-estate-directory',
    'Real Estate Directory',
    'Community and real-estate directory for association information, community rules and regulations.',
    NULL,
    ARRAY['React','Real Estate','Directory','Database TBD'],
    'Coming Soon',
    true,
    26
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    link = EXCLUDED.link,
    tech = EXCLUDED.tech,
    status = EXCLUDED.status,
    is_published = EXCLUDED.is_published,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO public.hub_schema_migrations (version)
VALUES ('011_normalize_extra_catalog_apps')
ON CONFLICT (version) DO NOTHING;

COMMIT;
