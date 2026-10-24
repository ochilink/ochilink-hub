-- Add a separate on-demand high-resolution cover preview.
BEGIN;

ALTER TABLE public.apps
    ADD COLUMN IF NOT EXISTS cover_preview_image TEXT;

ALTER TABLE public.apps
    DROP CONSTRAINT IF EXISTS apps_cover_preview_image_safe;

ALTER TABLE public.apps
    ADD CONSTRAINT apps_cover_preview_image_safe
    CHECK (
        cover_preview_image IS NULL
        OR (
            length(cover_preview_image) <= 700000
            AND cover_preview_image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
        )
    );

INSERT INTO public.hub_schema_migrations (version)
VALUES ('013_high_res_app_cover_previews')
ON CONFLICT (version) DO NOTHING;

COMMIT;
