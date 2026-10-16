# Mobile layout QA — 2026-10-15

Validated local rendered pages using Playwright with headless Chromium, mocked API responses and the repository's actual HTML/JS/CSS. No production data, real payments or emails were used.

## Coverage

121 screen/viewport combinations: landing, booking, dashboard, apps, users, security logs, error logs, consultations, settings, login and password recovery at widths 320, 360, 375, 390, 393, 412, 430, 480, 481, 768 and 1440 pixels. These span common iPhone SE/iPhone, Samsung/Pixel phone dimensions, both sides of the 480px breakpoint, tablet and desktop. A follow-up 320px pass verified compact checkbox sizing on the login screen.

Stress fixtures included long email addresses, long service names, audit metadata with 160-character identifiers, a consultation reservation, availability date inputs and seven nonzero audit days.

## Results

- No document horizontal overflow, off-viewport visible mobile content, clipped checked text/fields, vertically clipped panels, or browser JavaScript exceptions in the final viewport matrix.
- Mobile records expose every table column as a labeled field. Native table roles remain explicit. Tablet/desktop tables retain deliberate horizontal scrolling within their panels; this is excluded from viewport-overflow failures.
- Inspected rendered screenshots of 320px login/booking/dashboard and 390px consultations, plus 1440px dashboard. Fixed a revenue summary with a fixed height and an oversized checkbox found during visual inspection.
- npm test: 42 passing tests, including the new table-label/navigation regression and existing booking/payment/authentication coverage.
- git diff --check: passed.

## Remaining acceptance checks

This was Chromium viewport emulation, not tests on physical phones. Actual iOS Safari, Android Chrome on devices, native date-picker behavior, keyboard/safe-area behavior and landscape rotation still require device verification after the Preview update. External Google fonts were blocked in the local harness, so rendered screenshot checks used the site's fallback font stack; verify loaded web fonts on Preview too.

Payment webhook/inbox acceptance testing remains a separate task documented in DIRECT_BOOKING.md. Migration 004 was reported successful by the user; this mobile change adds no further database migration.
