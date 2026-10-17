-- OCH-SEC-009: retention infrastructure only. No records are deleted.
BEGIN;

CREATE TABLE IF NOT EXISTS public.hub_audit_investigation_holds (
    hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table TEXT NOT NULL CHECK (source_table IN ('security_auth_logs','system_error_logs')),
    record_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at TIMESTAMPTZ,
    released_by UUID REFERENCES public.users(id),
    release_reason TEXT,
    CHECK (released_at IS NULL OR (released_by IS NOT NULL AND length(trim(coalesce(release_reason,''))) >= 10)),
    UNIQUE (source_table, record_id, created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS hub_audit_active_hold_unique
    ON public.hub_audit_investigation_holds(source_table, record_id)
    WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS hub_audit_holds_active_idx
    ON public.hub_audit_investigation_holds(source_table, record_id)
    WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS public.hub_audit_cleanup_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    mode TEXT NOT NULL CHECK (mode IN ('dry_run','delete')),
    status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','succeeded','failed')),
    retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 30 AND 3650),
    security_eligible INTEGER NOT NULL DEFAULT 0 CHECK (security_eligible >= 0),
    error_eligible INTEGER NOT NULL DEFAULT 0 CHECK (error_eligible >= 0),
    security_deleted INTEGER NOT NULL DEFAULT 0 CHECK (security_deleted >= 0),
    error_deleted INTEGER NOT NULL DEFAULT 0 CHECK (error_deleted >= 0),
    error_code TEXT,
    CHECK (finished_at IS NULL OR finished_at >= started_at)
);
CREATE INDEX IF NOT EXISTS hub_audit_cleanup_runs_started_idx
    ON public.hub_audit_cleanup_runs(started_at DESC);

-- Hold creation/release and cleanup acquire the same transaction-scoped lock.
-- The trigger runs before a hold becomes visible or is released.
-- In READ COMMITTED, cleanup reads hold rows after acquiring this lock.
CREATE OR REPLACE FUNCTION public.hub_audit_hold_serialization()
RETURNS trigger LANGUAGE plpgsql AS $audit_hold$
BEGIN
    PERFORM pg_advisory_xact_lock(73419, 9);
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$audit_hold$;

DROP TRIGGER IF EXISTS hub_audit_hold_serialization_trigger
    ON public.hub_audit_investigation_holds;
CREATE TRIGGER hub_audit_hold_serialization_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.hub_audit_investigation_holds
FOR EACH ROW EXECUTE FUNCTION public.hub_audit_hold_serialization();

INSERT INTO public.hub_schema_migrations(version)
VALUES ('005_audit_retention_safeguards')
ON CONFLICT (version) DO NOTHING;

COMMIT;
