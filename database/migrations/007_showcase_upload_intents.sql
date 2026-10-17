-- OCH-MEDIA-001: durable pending-upload tracking for crash-safe orphan reconciliation.
BEGIN;
CREATE TABLE IF NOT EXISTS public.showcase_upload_intents (
  intent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES public.apps(id),
  actor_id UUID NOT NULL REFERENCES public.users(id),
  object_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','committed','cleanup_required','cleaned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error_code TEXT,
  CHECK (object_key ~ '^showcases/[0-9a-f-]+\.(html|png|jpg|webp)$')
);
CREATE INDEX IF NOT EXISTS showcase_upload_intents_reconcile
  ON public.showcase_upload_intents(created_at)
  WHERE state IN ('pending','cleanup_required');
INSERT INTO public.hub_schema_migrations(version)
VALUES ('007_showcase_upload_intents')
ON CONFLICT (version) DO NOTHING;
COMMIT;
