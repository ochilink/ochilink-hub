-- Ochilink Hub only. Run against the database selected for this Vercel project.
-- Transactional and repeatable; no demo accounts or fitness tables.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hub_schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))),
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer'
        CHECK (role IN ('admin', 'staff', 'vendor', 'customer')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    description TEXT NOT NULL DEFAULT '',
    link TEXT CHECK (link IS NULL OR link ~ '^https://[^[:space:]]+$'),
    tech TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'Coming Soon' CHECK (status IN ('Live', 'Coming Soon')),
    is_published BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apps_public_order ON public.apps (sort_order, name) WHERE is_published;
CREATE TABLE IF NOT EXISTS public.consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL CHECK (length(trim(client_name)) BETWEEN 1 AND 160),
    client_email TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    scheduled_at TIMESTAMPTZ,
    duration_minutes INTEGER NOT NULL DEFAULT 120 CHECK (duration_minutes BETWEEN 15 AND 1440),
    amount NUMERIC(12,2) CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
    status TEXT NOT NULL DEFAULT 'Requested'
        CHECK (status IN ('Requested', 'Scheduled', 'Completed', 'Cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (payment_status IN ('Unpaid', 'Paid', 'Refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultations_schedule ON public.consultations (scheduled_at);
CREATE TABLE IF NOT EXISTS public.site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.site_settings (key, value) VALUES
    ('consultation_pricing', '{"hourly":75,"minimum":150,"currency":"USD"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.security_auth_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    user_identity TEXT,
    failure_reason TEXT,
    request_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS security_auth_logs_time ON public.security_auth_logs (timestamp DESC);
CREATE TABLE IF NOT EXISTS public.system_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    service TEXT NOT NULL,
    message TEXT NOT NULL,
    request_id UUID,
    path TEXT
);
CREATE INDEX IF NOT EXISTS system_error_logs_time ON public.system_error_logs (created_at DESC);
CREATE TABLE IF NOT EXISTS public.hub_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hub_sessions_expiry ON public.hub_sessions (expires_at);
CREATE TABLE IF NOT EXISTS public.hub_rate_limits (
    bucket_hash TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
    PRIMARY KEY (bucket_hash, window_start)
);
-- API authorization is required. Do not expose database credentials to browsers.
-- These dedicated Hub tables are new even if other applications share the DB.
INSERT INTO public.hub_schema_migrations (version) VALUES ('001_ochilink_hub')
ON CONFLICT (version) DO NOTHING;
COMMIT;
