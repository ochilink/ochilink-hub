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
    access_token_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '1 day'),
    access_token_used_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_applications_email ON rental_applications(applicant_email, created_at DESC);
CREATE INDEX IF NOT EXISTS rental_applications_status ON rental_applications(status, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))),
    name TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rental_applications
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customer_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS rental_applications_customer ON rental_applications(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_sessions (
    token_hash TEXT PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_sessions_expiry ON customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS customer_magic_links (
    token_hash TEXT PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_magic_links_customer ON customer_magic_links(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(customer_id, name)
);

CREATE TABLE IF NOT EXISTS customer_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    application_id UUID REFERENCES rental_applications(id) ON DELETE SET NULL,
    folder_id UUID REFERENCES customer_folders(id) ON DELETE SET NULL,
    pathname TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
    etag TEXT,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready','deleted')),
    starred BOOLEAN NOT NULL DEFAULT false,
    shared BOOLEAN NOT NULL DEFAULT false,
    uploaded_at TIMESTAMPTZ,
    trashed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_documents_customer ON customer_documents(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_documents_folder ON customer_documents(folder_id, created_at DESC);

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

INSERT INTO hub_schema_migrations(version) VALUES ('014_rental_application')
ON CONFLICT (version) DO NOTHING;

COMMIT;
