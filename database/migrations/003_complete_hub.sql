BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step BIGINT NOT NULL DEFAULT -1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_hashes JSONB NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS hub_password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hub_password_resets_user ON hub_password_resets(user_id);
CREATE TABLE IF NOT EXISTS hub_email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    payload_encrypted TEXT NOT NULL,
    dedupe_key TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider_id TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS hub_email_outbox_pending ON hub_email_outbox(available_at) WHERE state IN ('pending','sending');
CREATE TABLE IF NOT EXISTS hub_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    CHECK (ends_at <= starts_at+interval '8 hours')
);
CREATE INDEX IF NOT EXISTS hub_availability_dates ON hub_availability(starts_at,ends_at);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES hub_availability(id);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS manage_token_hash TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS manage_token_until TIMESTAMPTZ;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payment_version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS consultations_slot ON consultations(slot_id);
CREATE TABLE IF NOT EXISTS hub_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id),
    version INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents>0),
    currency TEXT NOT NULL DEFAULT 'usd',
    session_id TEXT UNIQUE,
    payment_intent TEXT UNIQUE,
    checkout_url TEXT,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','paid','expired','refunded')),
    refunded_cents INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ,
    UNIQUE(consultation_id,version)
);
CREATE TABLE IF NOT EXISTS hub_payment_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hub_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_hash TEXT NOT NULL,
    path TEXT NOT NULL CHECK (length(path)<=160),
    event_type TEXT NOT NULL CHECK (event_type IN ('view','click','scroll')),
    cell INTEGER CHECK (cell BETWEEN 0 AND 95),
    target TEXT,
    depth INTEGER CHECK (depth BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hub_analytics_date ON hub_analytics(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS hub_analytics_view_once ON hub_analytics(session_hash,path) WHERE event_type='view';
INSERT INTO hub_schema_migrations(version) VALUES ('003_complete_hub') ON CONFLICT DO NOTHING;
COMMIT;
