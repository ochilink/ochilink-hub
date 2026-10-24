# Ochilink Hub Compatibility & UX Maintenance Baseline

## Purpose

This document records the browser, responsive, accessibility, navigation, and overflow behaviors that must remain intact during maintenance.

## Responsive baseline

Ochilink Hub uses a shared mobile standard across landing, booking, admin, login, and password recovery.

Current mobile expectations:

- mobile content width: 100%
- mobile content maximum width: 480px
- horizontal gutters: 16px
- cards: width 100%, min-width 0, 16px padding, 12px radius
- responsive mobile rules through 767px
- explicit 480px breakpoint for single-column/wrapping layouts
- long text may wrap anywhere instead of forcing viewport overflow
- flex/grid children may shrink with min-width:0
- controls stay within parent width
- inputs use 16px font size to avoid iOS focus zoom
- buttons and primary controls use at least 44px touch targets
- datetime controls stack on narrow screens

## Overflow and record visibility

Current safeguards:

- no mobile record fields are intentionally hidden or cropped
- truncation is removed from mobile record text
- mobile tables convert rows into labeled field cards while preserving the underlying record values
- tablet/desktop table panels use contained horizontal scrolling rather than document-level overflow
- table panels are keyboard focusable
- audit identifiers and long email/service values wrap safely
- drawers use viewport-bounded width

## Table semantics and accessibility

The mobile table adapter preserves explicit semantics:

- role=table
- role=rowgroup
- role=row
- role=columnheader
- role=cell

Column headings are reused as mobile field labels. This provides mobile readability without replacing the source records or event handlers.

## Focus and dialogs

Current accessibility expectations include:

- visible focus ring for keyboard focus
- dialog/lightbox role and aria-modal where applicable
- Escape closes supported dialogs/lightboxes
- focus is moved into opened modal/dialog UI
- focus returns to the previous control after close where implemented
- body scrolling is locked while the image lightbox is open
- clickable cover images have descriptive aria-label text

## Navigation and theme

Current behavior:

- landing and booking retain the shared Ochilink navigation treatment
- Admin uses responsive header/drawer behavior
- mobile navigation controls wrap instead of overflowing
- branding remains visible at narrow widths
- light and dark theme variables remain supported
- theme toggles retain keyboard focus styling

## Existing QA baseline

The existing rendered QA covered 121 page/viewport combinations at widths:

- 320
- 360
- 375
- 390
- 393
- 412
- 430
- 480
- 481
- 768
- 1440 pixels

Coverage included landing, booking, dashboard, apps, users, security logs, error logs, consultations, settings, login, and password recovery.

That QA reported no document horizontal overflow, off-viewport visible mobile content, clipped checked fields/text, vertically clipped panels, or browser JavaScript exceptions in the final matrix.

## Known limits

Viewport emulation is not equivalent to physical-device certification.

Still worth checking periodically on real devices:

- iOS Safari
- Android Chrome
- native date/time picker behavior
- software keyboard behavior
- safe-area insets
- landscape rotation
- loaded web fonts

## Maintenance review checklist

At each compatibility/UX maintenance review:

1. Run the full Node regression suite.
2. Confirm npm security audit gates pass.
3. Verify the shared mobile CSS still loads on landing, booking, and admin.
4. Confirm the 480px container and 16px gutter rules remain intact.
5. Confirm 44px touch targets remain intact.
6. Confirm input font size remains 16px on mobile.
7. Confirm mobile table labeling and roles still work after section navigation.
8. Confirm table panels remain focusable and contained.
9. Confirm dialogs/lightboxes retain Escape handling, focus management, and aria-modal semantics.
10. Confirm no new document-level horizontal overflow at 320px.
11. Confirm navigation and branding wrap safely at narrow widths.
12. Recheck representative desktop width (1440px) after major CSS changes.

## Change guardrails

Any change to the following requires focused compatibility regression coverage:

- mobile breakpoints
- container widths/gutters
- touch target sizing
- table-to-mobile-card behavior
- overflow rules
- focus-visible styling
- dialog/lightbox focus management
- navigation structure
- theme variables
- date/time control layout

Do not weaken these controls during unrelated feature work.
