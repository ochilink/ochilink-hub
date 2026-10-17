-- OCH-MEDIA-001: Extend existing app catalog without changing published behavior.
BEGIN;

ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS initials TEXT,
  ADD COLUMN IF NOT EXISTS preview_file_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_kind TEXT,
  ADD COLUMN IF NOT EXISTS preview_object_key TEXT,
  ADD COLUMN IF NOT EXISTS preview_updated_at TIMESTAMPTZ;

ALTER TABLE public.apps
  ADD CONSTRAINT apps_preview_kind_check
  CHECK (preview_kind IS NULL OR preview_kind IN ('html', 'image'));

-- Existing name, tech, status and link map to title, tech_stack, is_live and live_url.
-- Do not duplicate or backfill those fields; maintain a single source of truth.
-- Preview URLs are only populated by the future trusted server-side upload flow.
INSERT INTO public.hub_schema_migrations(version)
VALUES ('006_media_showcase_preview')
ON CONFLICT (version) DO NOTHING;

COMMIT;
