# Ochilink Mobile UI Standards

Version 1.0 — applies to landing, booking, admin, login and password recovery.

## Shared implementation

Load public/assets/hub-mobile.css after each page's existing stylesheet. Use mobile-container or mobile-public-container for page content; mobile-card for reusable panels; mobile-choice-row for date/time/duration controls. The admin feature card factory uses mobile-card. public/assets/hub-mobile.js supplies labels/roles to existing tables as React changes sections, retaining the records and event handlers.

- Mobile content: width 100%, maximum 480px, centered, 16px horizontal gutters and border-box sizing. Shared responsive rules cover phone widths through 767px; the explicit 480px breakpoint changes content grids to wrapping flex layouts.
- Cards: width 100%, min-width 0, 16px padding, 12px radius, theme background and overflow hidden. Use 16px consistently, including below 480px (the final implementation request takes precedence over the illustrative 14px example).
- Typography: clamp(20px, 5vw, 24px) h1; clamp(18px, 4.5vw, 22px) h2; clamp(14px, 3.5vw, 16px) paragraphs, spans and labels. Inputs remain 16px to prevent iOS focus zoom. Dense chart day labels and record field labels use 12px so all seven days fit without clipping.
- Spacing tokens: --space-1 8px, --space-2 16px, --space-3 24px, --space-4 32px. New mobile gaps, padding and controls use these tokens.
- Flex children can shrink; text uses overflow-wrap:anywhere and word-break:break-word. Mobile truncation is removed from record text. All record columns remain visible as labeled fields, rather than being clipped by the card.
- Buttons fit their parent and use at least 44px touch targets. Compact date/time/duration choices wrap in rows. Icons cap at 24px. Date inputs stack and have min-width:0/max-width:100%.
- Header branding stays intact; theme, Schedule and Login occupy a separate row. The session timer wraps below the admin title. The drawer fits the viewport. Overlay positioning, theme icons and visually hidden table headings retain positioning where needed for behavior or accessibility.
- Native table semantics are retained explicitly with table/rowgroup/row/cell/columnheader roles. Tablet/desktop tables scroll inside focusable panels; desktop layout/style remains otherwise unchanged.

## QA

Run npm test for database, payment and React DOM regression coverage. The mobile table regression verifies labels and original field values after navigating between consultations and error logs.

See MOBILE_QA.md for rendered browser checks and remaining device validation. Browser viewport emulation is not a physical iPhone/Android or Safari certification.
