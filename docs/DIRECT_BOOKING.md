# Direct paid booking activation

The /booking form now opens Stripe Checkout immediately. The amount comes from the database hourly/minimum pricing, never the browser. The existing homepage inquiry and administrator payment-link workflows remain supported.

## Activate on Preview

1. Run database/migrations/004_direct_booking.sql in the Ochilink Hub database after migration 003. It adds one boolean and a unique index; it is repeatable and preserves existing bookings. Apply this before deploying the new code. Deploying without it causes booking/availability SQL to fail.
2. Use the new branch's Preview deployment. Set PUBLIC_SITE_URL to that Preview's stable HTTPS origin. Checkout returns to /booking on this origin.
3. Configure STRIPE_SECRET_KEY using sandbox/test credentials, and STRIPE_WEBHOOK_SECRET from a webhook destination in the same Stripe sandbox/test environment. A restricted key with the required Checkout/PaymentIntent permissions is preferred. Never share these credentials in chat.
4. Configure the webhook destination as https://YOUR-PREVIEW-DOMAIN/api/stripe-webhook. Subscribe to checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, and charge.refunded. The existing signature verification requires the raw request body. If Vercel deployment protection blocks Stripe, configure an appropriate webhook protection bypass before testing.
5. Retain APP_ENCRYPTION_KEY, RESEND_API_KEY, MAIL_FROM and optionally NOTIFICATION_EMAIL for encrypted client/admin confirmation mail. The API requires the encryption key for direct booking. Email provider credentials are needed for delivery, not checkout creation.
6. Redeploy Preview after setting environment variables. Publish availability long enough for the selected duration. Verify 1h and 2h quote the configured minimum (currently $150), while 3h quotes $225 at $75/hour.
7. Complete a Stripe sandbox payment, verify the consultation becomes Scheduled/Paid, and verify confirmation mail/outbox. Do not enter a real card in a sandbox. A return from Checkout alone never confirms a booking.

## Holds, retries and expiry

- A random 256-bit browser token is stored in sessionStorage; only its hash is saved server-side. No contact data or card details are stored in browser storage. Repeated submits with that token resume the original consultation/quote, not a second booking. Refresh and use Resume payment after an interrupted checkout. To change an in-progress booking, finish/cancel it first; a retry intentionally retains the original details.
- The database hold and pending payment commit before contacting Stripe. A stable Stripe idempotency key prevents duplicate sessions if a network response is lost. A retry reuses an open session.
- Direct Checkout expires 35 minutes after the persisted payment was created. The database keeps pending payments reserved until a verified expired/failed event releases them. Delayed payment methods continue holding the appointment until Stripe reports success/failure; a local timeout never frees a potentially paid slot.
- Availability reads and daily maintenance reconcile up to five older Checkout Sessions per request against Stripe when an expiry webhook was missed. Unknown Stripe outcomes retain the hold. A provider outage can therefore temporarily prevent availability from loading, rather than risking another booking.
- A rare lost session-creation response leaves session_id unknown until the browser retries or a signed Stripe event (matched using payment metadata) arrives. If neither occurs, an administrator must investigate the pending record in Stripe; the hold is deliberately not guessed away. Cancellation must not release an unknown in-flight Stripe session without resolving its outcome.
- Only verified paid events set direct bookings to Scheduled/Paid. Duplicate webhook deliveries do not duplicate confirmation emails. Paid/refunded records retain the existing refund synchronization. Payments after cancellation/quote changes are recorded and flagged for review, without auto-confirming.
- Cancellations require 24-hour notice in the existing booking copy; refund requests are handled by contacting Ochilink. Automatic refunds/cancellation and external calendar synchronization are not implemented.

## Validation

Run npm ci and npm test. Tests use an in-process PostgreSQL-compatible database and mock Stripe calls; they do not charge cards or send email. Live Preview payment, webhook delivery and inbox delivery must be tested after activation.
