# Ochilink Google Tag Manager Tracking

## Architecture

Ochilink Hub is a static React bundle served by Vercel with Node API routes. It is not a Next.js App Router application, so the integration intentionally does not use `@next/third-parties`.

The shared browser layer is `public/assets/hub-tracking.js`.

GTM is loaded only when:

1. the user has chosen **Allow analytics**;
2. `localStorage['ochi-analytics-consent'] === 'yes'`; and
3. the server exposes a valid `GTM_CONTAINER_ID`.

The GTM container ID is public configuration, not a secret. Set it in Vercel for Preview and Production only after the container is ready.

## Existing GA4 measurement

The previous direct GA4 tag used:

- `G-N6QYDZK8MR`

Do not add the old direct `gtag.js` snippet back to the HTML. Configure the Google tag / GA4 destination inside GTM instead so there is only one analytics loader.

## GTM setup

1. In Google Tag Manager, create or open the Ochilink Web container.
2. In Vercel, add its `GTM-...` ID as `GTM_CONTAINER_ID`.
3. In GTM, create a **Google tag** using measurement ID `G-N6QYDZK8MR`.
4. Use an **All Pages** trigger. The container itself is only loaded after Ochilink analytics consent, so the tag will not exist before consent.
5. Create Data Layer Variables for any parameters you want to send to GA4:
   - `section`
   - `action`
   - `item_type`
   - `app_slug`
   - `filter`
   - `result`
   - `step`
   - `source`
6. Create GA4 Event tags for the Ochilink custom events below, or use a regex Custom Event trigger matching `^ochilink_.+` and map the event name and approved variables.

## Current custom events

| Event | Purpose | Safe parameters |
| --- | --- | --- |
| `ochilink_consent_granted` | Analytics consent enabled | `analytics_storage` |
| `ochilink_consultation_submitted` | Consultation request successfully submitted | `section`, `action`, `result` |
| `ochilink_consultation_checkout_started` | User resumes consultation Stripe checkout | `section`, `action` |
| `ochilink_consultation_payment_returned` | User returns from consultation checkout | `section`, `action` |
| `ochilink_rental_checkout_started` | Rental application begins Stripe checkout | `section`, `action`, `step` |
| `ochilink_rental_payment_verified` | Rental payment return is verified | `section`, `action`, `result` |
| `ochilink_customer_vault_opened` | Customer Vault successfully opens | `section`, `action` |
| `ochilink_document_opened` | Customer opens a document | `section`, `action`, `item_type` |
| `ochilink_rental_pdf_downloaded` | Customer downloads rental application PDF | `section`, `action`, `item_type` |

## Privacy rules

Never place any of the following in GTM or GA4 event payloads:

- names
- email addresses
- phone numbers
- street addresses
- DOB or SSN data
- customer IDs
- rental application IDs
- magic-link or access tokens
- signatures
- document/file names
- Stripe IDs
- card/payment details
- payment amounts

The shared tracking layer uses an allowlist for event parameters and drops sensitive-key patterns before anything reaches `dataLayer`.

## Verification

In a Preview deployment:

1. Clear `ochi-analytics-consent` from local storage.
2. Reload and verify no `gtm.js` network request is made.
3. Choose **Allow analytics**.
4. Verify `gtm.js?id=GTM-...` loads.
5. Use GTM Preview / Tag Assistant to confirm the expected events.
6. Inspect `window.dataLayer` and confirm no personal or payment data is present.
7. Test Decline in a fresh browser profile and verify GTM never loads.

Do not publish the GTM container until its GA4 tags and privacy-safe variables have been reviewed.
