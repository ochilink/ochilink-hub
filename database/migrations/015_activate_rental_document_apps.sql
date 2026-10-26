-- Run only after the rental application + customer document portal code is deployed
-- and verified in Production. This migration changes public catalog visibility.
BEGIN;

UPDATE apps
SET link='https://ochilink.com/rental-application/',
    tech=ARRAY['HTML','React','Neon PostgreSQL','Stripe','Resend'],
    status='Live',
    is_published=true,
    updated_at=now()
WHERE slug='ochilink-rental-application';

UPDATE apps
SET link='https://ochilink.com/account/',
    tech=ARRAY['HTML','JavaScript','Neon PostgreSQL','Vercel Blob','Resend'],
    status='Live',
    is_published=true,
    updated_at=now()
WHERE slug='ochilink-document-storage';

INSERT INTO hub_schema_migrations(version) VALUES ('015_activate_rental_document_apps')
ON CONFLICT (version) DO NOTHING;

COMMIT;
