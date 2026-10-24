# Ochilink Hub Email Maintenance Baseline

## Purpose

This document records the transactional-email safeguards and retry behavior that must remain intact during maintenance.

## Provider configuration

Email delivery is enabled only when both RESEND_API_KEY and MAIL_FROM are configured.

Production configuration must keep:

- RESEND_API_KEY as a secret
- MAIL_FROM on a verified Resend sending domain
- APP_ENCRYPTION_KEY for encrypted queued payloads
- CRON_SECRET for scheduled retry/cleanup maintenance

Never expose those secret values in logs, screenshots, tickets, or source control.

## Outbox security

Transactional messages are queued in hub_email_outbox.

Current protections:

- queued payloads are encrypted before database storage
- dedupe_key prevents duplicate logical messages
- sent payload bodies are erased after provider acceptance
- failed/expired payloads are scrubbed when retention rules require it
- provider error details are reduced to controlled status strings
- the Resend API key is sent only in the Authorization header
- provider requests use an 8-second timeout
- each queued message uses a stable Resend Idempotency-Key derived from its outbox row ID

## Retry behavior

Current retry rules:

- immediate sends are attempted by the initiating workflow
- scheduled/manual retry processes at most five messages per batch
- a message in pending state is eligible when available_at is reached
- a stale sending state is recoverable after available_at
- every send attempt advances available_at by five minutes
- provider/network failures return the row to pending until the tenth attempt
- after ten attempts the row becomes failed
- the daily /api/maintenance job provides fallback retry execution
- authenticated Admin controls can also trigger pending email processing

The daily maintenance job is not a five-minute scheduler; unattended five-minute retry cadence requires an external scheduler or deployment-plan feature.

## Expiry rules

Password reset email:

- reset token expires after 30 minutes
- an unsent password-reset outbox row older than 30 minutes is marked failed
- its encrypted payload is erased
- the user must request a new reset link

Other unsent email:

- outbox delivery processing ignores messages older than 23 hours
- maintenance marks old unsent rows failed with EXPIRED and clears encrypted payloads
- outbox rows are retained for up to 90 days before cleanup

## Branded templates

Current branded HTML templates use the Ochilink visual system and must remain consistent:

- dark #0B0F1A header/footer
- teal #00FFC6 accent
- ochilink wordmark treatment
- responsive email table layout
- plain-text fallback accompanies HTML
- CTA URLs are restricted to HTTPS with a safe ochilink.com fallback

Maintained branded message types include:

- booking confirmation
- payment received
- administrator paid-booking notification
- password/security notifications where HTML templates are provided

All user-provided values inserted into HTML templates must remain escaped.

## Booking confirmation resend

The Admin resend-confirmation action is authenticated.

Current behavior:

- resend is exposed only for appropriate paid Scheduled/Completed consultations
- a fresh branded confirmation message is rebuilt from the current consultation/payment record
- resend does not alter payment state
- outbox dedupe/retry protections still apply

## Provider acceptance vs inbox delivery

A Resend API success marks a message sent because the provider accepted it. It does not prove inbox placement.

Operational review should distinguish:

- accepted by provider
- bounced/rejected by recipient provider
- delayed
- delivered to mailbox provider
- actually seen by recipient

## Maintenance review checklist

At each email maintenance review:

1. Confirm RESEND_API_KEY and MAIL_FROM are present without decrypting them.
2. Confirm APP_ENCRYPTION_KEY and CRON_SECRET remain configured.
3. Run the full Node regression suite.
4. Confirm npm security audit gates pass.
5. Confirm branded template regression tests pass.
6. Confirm resend-confirmation regression tests pass.
7. Confirm retry interval remains five minutes.
8. Confirm retry stop remains ten attempts.
9. Confirm password-reset email expiry remains 30 minutes.
10. Confirm other unsent encrypted payloads expire before 24 hours.
11. Confirm sent/expired payload bodies are scrubbed.
12. Review Admin outbox status for repeated failures before retrying manually.

## Change guardrails

Any change to the following requires focused email regression tests:

- encryption/storage of queued payloads
- provider idempotency key
- provider timeout
- retry interval or maximum attempts
- reset-email expiry
- outbox retention
- payload scrubbing
- template escaping
- booking-confirmation resend authorization
- sender/domain configuration

Do not weaken these controls during unrelated UI, booking, or catalog changes.
