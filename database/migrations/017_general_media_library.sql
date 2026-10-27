BEGIN;

CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID REFERENCES apps(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image')),
    pathname TEXT NOT NULL UNIQUE,
    public_url TEXT NOT NULL,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
    byte_size BIGINT NOT NULL CHECK (byte_size > 0),
    width INTEGER CHECK (width IS NULL OR width > 0),
    height INTEGER CHECK (height IS NULL OR height > 0),
    alt_text TEXT,
    label TEXT,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready','archived')),
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_assets_app_created
    ON media_assets(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_state_created
    ON media_assets(state, created_at DESC);

INSERT INTO hub_schema_migrations(version) VALUES ('017_general_media_library')
ON CONFLICT (version) DO NOTHING;

COMMIT;
