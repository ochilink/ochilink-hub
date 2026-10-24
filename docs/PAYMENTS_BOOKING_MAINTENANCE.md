# Ochilink Hub Payments & Booking Maintenance Baseline

## Purpose

This document records the payment and direct-booking safeguards that must remain intact during maintenance.

## Live Stripe endpoint

Production webhook destination:

- https://ochilink.com/api/stripe-webhook

Required live events:

- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.async_payment_failed
- checkout.session.expired
- charge.refunded

The webhook must remain signature-verified using the configured Stripe webhook secret. A browser redirect from Checkout must never mark a consultation paid.

## Pricing integrity

Booking and payment amounts are server-controlled.

Current protections:

- consultation pricing is read from the database
- the browser does not supply the final Stripe amount
- payment rows store amount in integer cents
- Checkout line-item amount comes from the persisted payment row
- currency comes from the persisted consultation/payment state
- paid webhook processing verifies amount and currency before accepting payment
- a mismatched amount/currency causes the payment event to fail for review instead of silently updating the booking

Current production pricing baseline:

- hourly rate: $75
- minimum consultation: $150
- 1 hour: $150 minimum
- 2 hours: $150 minimum
- 3 hours: $225

Pricing remains dynamic and must not be hardcoded into Stripe event processing.

## Checkout idempotency and retries

Current protections:

- payment creation is versioned per consultation
- Checkout uses a stable Stripe idempotency key derived from consultation ID and payment version
- an existing open Checkout Session is reused
- repeated browser submissions resume the existing consultation/payment flow
- duplicate webhook event IDs are ignored through hub_payment_events replay protection
- duplicate paid events do not duplicate confirmation processing

## Reservation and expiry behavior

Direct paid bookings use a conservative hold model.

Current behavior:

- a direct-booking Checkout Session expires after 35 minutes
- a pending payment keeps the appointment reserved until Stripe confirms the final outcome
- checkout.session.expired and checkout.session.async_payment_failed mark the pending payment expired
- an expired/failed direct booking clears reserved_until and cancels the requested consultation when no pending/paid payment remains
- local elapsed time alone does not release an unknown in-flight payment
- missed/delayed webhooks are reconciled against Stripe for pending payments older than 35 minutes
- reconciliation checks a limited batch per request/maintenance run
- unknown Stripe outcomes retain the hold rather than risk double-booking

This conservative behavior is intentional.

## Availability safety

Availability queries must exclude slots that overlap:

- Scheduled consultations
- Requested consultations with active reservations
- Requested consultations with a pending Checkout payment

A provider outage may temporarily keep a slot unavailable. This is safer than opening a slot that may already have a payment in flight.

## Paid event behavior

Only verified paid Stripe events may confirm a direct booking.

When a valid paid event matches the current consultation/payment version:

- payment state becomes paid
- consultation payment_status becomes Paid
- direct booking status becomes Scheduled
- reservation hold is cleared
- payment receipt/security audit events are recorded

If payment arrives after a cancellation or quote/version change, it is recorded but flagged for manual review rather than silently scheduling the consultation.

## Refund behavior

Verified charge.refunded events synchronize refund state.

Current protections:

- refund amount/currency must match the recorded payment context
- fully refunded payments become refunded
- consultation payment_status becomes Refunded for a full refund
- refund events are audited
- initiating refunds remains an administrative Stripe action; Hub does not expose an unreviewed automatic refund button

## Maintenance and reconciliation

The protected /api/maintenance task:

- reconciles older pending Stripe Checkout Sessions
- flushes queued email
- performs the existing retention/cleanup jobs

The task is protected by CRON_SECRET.

## Live maintenance review checklist

At each payment/booking maintenance review:

1. Confirm Production deployment is healthy.
2. Confirm Stripe live webhook endpoint is enabled.
3. Confirm the five required webhook event subscriptions remain configured.
4. Review Stripe undelivered events and separate current Ochilink booking events from unrelated/historical account activity.
5. Run the full Node regression suite.
6. Confirm npm security audit gates pass.
7. Confirm server-side quote/pricing tests pass.
8. Confirm idempotent Checkout-session reuse tests pass.
9. Confirm expired/failed Checkout events release only safe reservations.
10. Confirm paid events do not trust browser redirects.
11. Confirm duplicate webhook deliveries remain idempotent.
12. Confirm availability still excludes pending/reserved/scheduled overlaps.
13. Confirm refund synchronization tests pass.

## Change guardrails

Any change to the following requires focused payment/booking regression tests:

- pricing/minimum calculation
- payment amount/currency handling
- payment_version behavior
- Stripe idempotency keys
- webhook event verification
- Checkout expiry duration
- reservation release rules
- reconciliation behavior
- availability overlap rules
- refund synchronization
- confirmation email timing

Do not weaken these controls during unrelated UI or catalog work.
