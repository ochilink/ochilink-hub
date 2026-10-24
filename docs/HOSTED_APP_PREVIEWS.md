# Ochilink Hosted App Preview Library

## Purpose

The Hosted App Preview Library lets a Coming Soon Ochilink product expose a safe, stable HTML demo link without replacing its real production URL.

Live products continue to use `apps.link`. Coming Soon products use the active hosted preview only when `apps.preview_enabled=true`.

## Storage separation

- Customer rental documents remain in the private Blob store configured by `BLOB_READ_WRITE_TOKEN`.
- Hosted HTML previews use a separate PUBLIC Vercel Blob store configured by `PREVIEW_BLOB_READ_WRITE_TOKEN`.
- The public Blob token remains server-side. Admin receives only a short-lived signed upload authorization.
- Uploaded preview HTML executes on the Blob origin, not on `ochilink.com`, so Hub Admin and customer cookies are not sent to the preview.

## First-release scope

HUB-PREVIEW-001 supports one self-contained `.html` or `.htm` file per preview version.

Use self-contained HTML when possible:

- inline CSS
- inline JavaScript
- data-URI images, or externally hosted HTTPS assets

Multi-file ZIP previews with relative CSS/JS/image folders are intentionally deferred to the next preview milestone.

## Admin workflow

Open `/admin/previews/` after signing into Ochilink Admin.

1. Choose an app.
2. Choose a self-contained HTML file.
3. Upload and publish the new version.
4. The previous version remains in history.
5. The newest completed upload becomes active and enables public preview visibility.
6. An administrator can disable the preview without deleting it.
7. An older ready version can be reactivated.

## Public card behavior

- `Live` + production URL → **Open app**
- `Live` + no production URL → **Live locally**
- `Coming Soon` + enabled ready preview → **View preview**
- `Coming Soon` + no enabled preview → **Coming soon**

The production URL and preview URL are always separate records.

## Database

Migration `016_app_preview_library.sql` adds:

- `apps.preview_enabled`
- `app_previews`
- per-app version numbers
- one-active-preview constraint
- upload metadata and audit-friendly timestamps

Migration 016 does not enable any existing app preview by itself.

## Environment

Add the following server-side environment variable:

`PREVIEW_BLOB_READ_WRITE_TOKEN`

It must point to a PUBLIC Vercel Blob store dedicated to website previews.

Do not reuse the private customer-document store token.

## Release order

Because the Hub public/admin catalog queries preview metadata, apply migration 016 to the intended Preview database before deploying this preview-library code.

Recommended sequence:

1. Create a separate public Vercel Blob store.
2. Add `PREVIEW_BLOB_READ_WRITE_TOKEN` to the Preview environment.
3. Apply `016_app_preview_library.sql` to the Preview Neon database.
4. Deploy the feature branch after the Vercel deployment limit clears.
5. Open `/admin/previews/`.
6. Upload a small self-contained HTML demo to a Coming Soon app.
7. Confirm the Hub card says **View preview** and opens the public Blob URL.
8. Confirm disabling the preview returns the card to **Coming soon**.
9. Confirm activating an older version changes the preview destination without altering `apps.link`.
10. Confirm Live products still open only their production URLs.

## Security acceptance checks

- Preview API rejects unauthenticated/non-admin requests.
- Only HTML files are accepted.
- Maximum preview size is 8 MB.
- The server validates that the completed Blob URL belongs to the configured public preview store.
- The returned Blob pathname must exactly match the authorized pathname.
- Preview HTML does not execute on the Ochilink Hub origin.
- Customer/private Blob token is never reused for previews.
- Upload, publish, enable/disable, and version activation actions are audit logged.

## Next milestone

HUB-PREVIEW-002 can add ZIP upload and controlled extraction for multi-file sites after the single-file HTML flow is deployed and verified.
