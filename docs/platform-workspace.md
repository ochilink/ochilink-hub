# Ochilink Workspace foundation

The Hub is the platform entry point at `/workspace`. The existing Hub catalog remains intact. Migration 018 adds a 25-app registry, explicit app audiences, six integration records, and a reserved table for verified cross-app identity links.

## Release / initialization

Deploy the Hub code first. A signed-in Hub administrator opens `/workspace` and selects Initialize Ochilink Workspace. The protected, same-origin POST applies the additive migration inside Hub using its existing database connection. The current app catalog is backed up in `platform_setup_backups` before any inserts. No environment secrets are exported. Re-running setup is safe and does not overwrite existing platform configuration.

## Boundaries

- Customer sessions see public-audience apps only. Staff see public and staff apps. Only Hub administrators see internal/admin tools.
- App visibility is navigation permission, not permission to the destination's data. Destination applications retain their current sign-in, account locks and MFA.
- No automatic account merging, email-only identity matching, shared parent-domain cookies or credential copying.
- Shared sign-in and Calendar appointment return synchronization are explicitly marked Planned / Link only, not Connected.
- No remote databases or paid services are provisioned.
- No newsletters, payments or customer messages are sent.
- A verified cross-app identity link is a prerequisite for future SSO; the reserved link table alone does not grant access.

## Next integration work

Implement Hub-issued, short-lived, audience-bound single-use handoffs to CRM and Calendar, with explicit account linking in each existing authenticated app and continued MFA. Add a signed, idempotent event outbox/inbox for appointment and application status synchronization. Keep TaxDrill and Vault data access separately controlled.
