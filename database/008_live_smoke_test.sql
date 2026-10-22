-- Apply only to a dedicated staging database before enabling the feature.
CREATE TABLE IF NOT EXISTS hub_live_smoke_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  stripe_session_id text UNIQUE,
  checkout_url text,
  stripe_payment_intent text,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','checkout_open','paid','expired','failed','refunded')),
  amount_cents integer NOT NULL DEFAULT 100 CHECK (amount_cents = 100),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One smoke-test authorization per database, even across redeployments.
CREATE UNIQUE INDEX IF NOT EXISTS hub_live_smoke_tests_one_only
  ON hub_live_smoke_tests ((true));
