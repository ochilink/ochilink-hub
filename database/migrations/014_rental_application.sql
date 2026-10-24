BEGIN;

CREATE TABLE IF NOT EXISTS rental_fee_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    application_fee_cents INTEGER NOT NULL DEFAULT 15000 CHECK (application_fee_cents >= 0),
    processing_percent NUMERIC(6,3) NOT NULL DEFAULT 2.9 CHECK (processing_percent >= 0),
    processing_fixed_cents INTEGER NOT NULL DEFAULT 30 CHECK (processing_fixed_cents >= 0),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO rental_fee_config(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS rental_fee_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    old_config JSONB,
    new_config JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rental_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    applicant_email TEXT NOT NULL CHECK (applicant_email = lower(trim(applicant_email))),
    applicant_name TEXT NOT NULL CHECK (length(trim(applicant_name)) BETWEEN 1 AND 160),
    applicant_phone TEXT NOT NULL DEFAULT '',
    property_address TEXT NOT NULL DEFAULT '',
    data_encrypted TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment'
        CHECK (status IN ('draft','pending_payment','submitted','under_review','additional_information_required','approved','denied','withdrawn','payment_expired','archived')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid','paid','refunded')),
    application_fee_cents INTEGER NOT NULL CHECK (application_fee_cents >= 0),
    processing_fee_cents INTEGER NOT NULL CHECK (processing_fee_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency ~ '^[a-z]{3}$'),
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent TEXT UNIQUE,
    access_token_hash TEXT NOT NULL UNIQUE,
    paid_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_applications_email ON rental_applications(applicant_email, created_at DESC);
CREATE INDEX IF NOT EXISTS rental_applications_status ON rental_applications(status, created_at DESC);

CREATE TABLE IF NOT EXISTS rental_application_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES rental_applications(id) ON DELETE CASCADE,
    storage_key TEXT,
    original_name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
    category TEXT NOT NULL DEFAULT 'Other',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_application_documents_app ON rental_application_documents(application_id, created_at DESC);

UPDATE apps
SET link='https://ochilink.com/rental-application/',
    tech=ARRAY['HTML','React','Neon PostgreSQL','Stripe','Resend'],
    status='Live',
    is_published=true,
    updated_at=now()
WHERE slug='ochilink-rental-application';

INSERT INTO hub_schema_migrations(version) VALUES ('014_rental_application')
ON CONFLICT (version) DO NOTHING;

COMMIT;
