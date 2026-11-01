# Ochilink Workspace foundation

The Hub is the platform entry point at `/workspace`. The existing Hub catalog remains intact. Migration 018 adds a 25-app registry, explicit app audiences, six integration records, and a reserved table for verified cross-app identity links.

## Release / initialization

Deploy the Hub code first. A signed-in Hub administrator opens `/workspace` and selects Initialize Ochilink Workspace. The protected, same-origin POST applies the additive migration inside Hub using its existing database connection. The current app catalog is backed up in `platform_setup_backups` before any inserts. No environment secrets are exported. Re-running setup is safe and does not overwrite existing platform configuration.

## Boundaries

- Customer sessions see public-audience apps only. Staff see public and staff apps. Only Hub administrators see internal/admin tools.
- App visibility is navigation permission, not permission to the destination's data. Destination applications retain their current sign-in, account locks and MFA.
- No automatic account merging, email-only identity matching, shared parent-domain cookies or credential copying.
- Linked Hub sign-in is available for CRM and Calendar after migration 019 and explicit account confirmation. Calendar appointment return synchronization remains Link only.
- No remote databases or paid services are provisioned.
- No newsletters, payments or customer messages are sent.
- A verified cross-app identity link is a prerequisite for future SSO; the reserved link table alone does not grant access.

## Next integration work

Add a signed, idempotent event outbox/inbox for appointment and application status synchronization. Keep TaxDrill and Vault data access separately controlled.

## Linked sign-in (migration 019)

The Hub administrator activates linked sign-in from `/workspace`. The migration only adds expiring handoff records and updates launch links; it creates no account links. Each user opens CRM Account Security > Hub sign-in settings or Calendar > Hub sign-in settings, signs into Hub, reviews both account addresses, and confirms with the destination's existing verification. CRM retains 2FA. Existing passwords and permissions remain unchanged.

The handoff uses an opaque 60-second code, S256 PKCE, a fixed HTTPS callback allowlist, browser-bound state and nonce, server-to-server exchange, and atomic single-use consumption. No parent-domain cookies, shared database credentials or passwords cross between apps. Hub subjects include staff/customer namespaces. Destination links bind the existing local account ID and credential version; password/security resets require reconnecting. Staff/admin roles are checked at the receiver. This is a narrow first-party handoff, not a general OAuth/OIDC provider.

Identity links live in each destination database (`crm_hub_links`, `calendar_hub_links`). Destination sessions remain independently revocable. Hub logout does not currently revoke an existing destination session. A future central session lifecycle must address coordinated revocation before more sensitive apps join.

Validation uses synthetic identities and temporary CRM tables, never real-account session creation. No client emails, appointments, payments or public articles are created during verification.

