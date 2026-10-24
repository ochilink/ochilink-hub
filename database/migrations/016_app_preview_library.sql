BEGIN;

ALTER TABLE apps
    ADD COLUMN IF NOT EXISTS preview_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS app_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    pathname TEXT NOT NULL UNIQUE,
    public_url TEXT NOT NULL,
    original_name TEXT NOT NULL,
    byte_size BIGINT NOT NULL CHECK (byte_size > 0),
    content_type TEXT NOT NULL DEFAULT 'text/html' CHECK (content_type = 'text/html'),
    etag TEXT,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready','archived')),
    is_active BOOLEAN NOT NULL DEFAULT false,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at TIMESTAMPTZ,
    UNIQUE(app_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS app_previews_one_active
    ON app_previews(app_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS app_previews_app
    ON app_previews(app_id, version DESC);

INSERT INTO hub_schema_migrations(version) VALUES ('016_app_preview_library')
ON CONFLICT (version) DO NOTHING;

COMMIT;
