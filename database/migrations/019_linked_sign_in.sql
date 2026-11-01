BEGIN;
CREATE TABLE IF NOT EXISTS platform_signin_codes(code_hash TEXT PRIMARY KEY,client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,pkce_challenge TEXT NOT NULL,nonce TEXT NOT NULL,subject_kind TEXT NOT NULL CHECK(subject_kind IN ('staff','customer')),subject_id UUID NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '60 seconds');
CREATE INDEX IF NOT EXISTS platform_signin_codes_expiry ON platform_signin_codes(expires_at);
INSERT INTO hub_schema_migrations(version) VALUES('019_linked_sign_in') ON CONFLICT DO NOTHING;
UPDATE platform_apps SET login_mode='Link existing account for Hub sign-in',launch_url='https://crm.ochilink.com/api/account/hub/start',updated_at=now() WHERE app_id IN(SELECT id FROM apps WHERE slug='ochilink-pro-crm');
UPDATE platform_apps SET login_mode='Link existing account for Hub sign-in',launch_url='https://calendar-test.ochilink.com/index.php?path=auth/hub&action=start',updated_at=now() WHERE app_id IN(SELECT id FROM apps WHERE slug='ochilink-calendar');
UPDATE platform_integrations SET status='Connected',details='Hub sign-in is available for explicitly linked CRM and Calendar accounts. Destination permissions and CRM 2FA remain enforced; other apps retain separate sign-in.',updated_at=now() WHERE id='shared-login';
COMMIT;
