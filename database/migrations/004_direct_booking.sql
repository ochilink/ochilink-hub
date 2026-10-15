BEGIN;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS checkout_required BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS consultations_booking_token ON consultations(manage_token_hash) WHERE checkout_required;
INSERT INTO hub_schema_migrations(version) VALUES ('004_direct_booking') ON CONFLICT DO NOTHING;
COMMIT;
