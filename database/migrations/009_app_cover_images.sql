-- Add optional HTTPS cover image URLs for Ochilink app cards.
-- Safe to run once on Production after v1.0.
BEGIN;

ALTER TABLE public.apps
    ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE public.apps
    DROP CONSTRAINT IF EXISTS apps_cover_image_url_https;

ALTER TABLE public.apps
    ADD CONSTRAINT apps_cover_image_url_https
    CHECK (
        cover_image_url IS NULL
        OR cover_image_url ~ '^https://[^[:space:]]+$'
    );

INSERT INTO public.hub_schema_migrations (version)
VALUES ('009_app_cover_images')
ON CONFLICT (version) DO NOTHING;

COMMIT;
