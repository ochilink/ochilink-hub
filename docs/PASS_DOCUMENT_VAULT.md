# PASS Customer Document Vault

This document describes the customer document-storage integration for the Ochilink PASS rental application.

## Architecture

- Ochilink Hub remains the source of truth for routing, authentication, audit logging and Stripe.
- Neon PostgreSQL stores customer accounts, rental applications, folders and document metadata.
- Private Vercel Blob stores the actual document bytes.
- Public HTML never receives the server read/write Blob token.
- Browser uploads use short-lived, pathname-scoped signed upload authorizations.
- Downloads use short-lived signed read URLs created only after the Hub confirms the requested document belongs to the signed-in customer.

## Customer account flow

1. A PASS application is stored encrypted in Neon and sent to Stripe Checkout.
2. The verified Stripe webhook marks the application paid/submitted.
3. A customer account is created or reused for the applicant email and linked to the application.
4. The customer enters the account using either the post-payment application ID plus application access token, or an emailed 20-minute magic sign-in link.
5. The account session is an HttpOnly, Secure, SameSite=Strict cookie.
6. /account/ loads applications, folders and documents scoped to that customer ID.

## Document flow

The browser asks the Hub to begin an upload with the file name, MIME type, byte size, optional folder and optional rental application.

The Hub verifies the customer session, verifies the folder/application belongs to that customer, validates the file type and maximum size, creates a customer-specific private Blob pathname, requests a short-lived upload authorization, and then creates a pending metadata record.

After the direct upload succeeds, the browser calls the completion endpoint and the record changes from pending to ready.

Document downloads never expose a permanent public URL. The Hub verifies ownership first and returns a five-minute signed private read URL.

## Environment

Required in the deployment environment:

- DATABASE_URL
- APP_ENCRYPTION_KEY
- RATE_LIMIT_SECRET
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- RESEND_API_KEY
- MAIL_FROM
- PUBLIC_SITE_URL
- BLOB_READ_WRITE_TOKEN

BLOB_READ_WRITE_TOKEN is server-side only.

## Customer endpoints

- GET /api/hub?resource=customer-auth&action=session
- POST /api/hub?resource=customer-auth&action=request-link
- POST /api/hub?resource=customer-auth&action=exchange-magic
- POST /api/hub?resource=customer-auth&action=exchange-application
- POST /api/hub?resource=customer-auth&action=logout
- GET /api/hub?resource=customer-documents&action=list
- POST /api/hub?resource=customer-documents&action=folder
- POST /api/hub?resource=customer-documents&action=begin-upload
- POST /api/hub?resource=customer-documents&action=complete-upload
- GET /api/hub?resource=customer-documents&action=download&id=<document-id>
- PUT /api/hub?resource=customer-documents&action=document

All mutations remain protected by the Hub same-origin JSON policy.

## Acceptance checks before production

- Apply migration 014_rental_application.sql.
- Configure a private Blob store and BLOB_READ_WRITE_TOKEN.
- Verify PASS test payment creates or links the customer account.
- Verify a customer can request and consume a magic link.
- Upload PDF, JPEG and DOCX files.
- Verify a second customer cannot list, open, move or modify another customer's file.
- Verify expired or invalid magic links fail.
- Verify signed document download links expire.
- Verify a failed Blob authorization does not create a pending metadata row.
- Verify security audit rows are created for upload, open and document-state changes.
- Verify Trash/Restore and Star/Unstar.
- Verify mobile account layout.
