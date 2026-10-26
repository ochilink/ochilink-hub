import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('compatibility and UX baseline preserves responsive and accessibility safeguards', () => {
  const css = fs.readFileSync(new URL('../public/assets/hub-mobile.css', import.meta.url), 'utf8');
  const mobile = fs.readFileSync(new URL('../public/assets/hub-mobile.js', import.meta.url), 'utf8');
  const landing = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const admin = fs.readFileSync(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  const booking = fs.readFileSync(new URL('../public/booking/index.html', import.meta.url), 'utf8');

  assert.match(css, /max-width: 480px/);
  assert.match(css, /--space-2: 16px/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /font-size: 16px/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /min-width: 0/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /width: min\(320px, calc\(100vw - 32px\)\)/);

  assert.match(mobile, /setAttribute\('tabindex', '0'\)/);
  assert.match(mobile, /setAttribute\('role', 'table'\)/);
  assert.match(mobile, /setAttribute\('role', 'rowgroup'\)/);
  assert.match(mobile, /setAttribute\('role', 'row'\)/);
  assert.match(mobile, /setAttribute\('role', 'columnheader'\)/);
  assert.match(mobile, /setAttribute\('role', 'cell'\)/);
  assert.match(mobile, /cell\.dataset\.label/);

  assert.match(landing, /role:"dialog"/);
  assert.match(landing, /"aria-modal":"true"/);
  assert.match(landing, /Close image preview/);
  assert.match(landing, /key==="Escape"/);
  assert.ok(landing.includes('#447E37') || landing.includes('var(--lime)'));

  for (const page of [landing, admin, booking]) {
    assert.match(page, /hub-mobile\.css/);
    assert.match(page, /name="viewport"/);
  }
});

test('compatibility and UX maintenance documentation records current guardrails', () => {
  const doc = fs.readFileSync(new URL('../docs/COMPATIBILITY_UX_MAINTENANCE.md', import.meta.url), 'utf8');
  assert.match(doc, /121 page\/viewport combinations/);
  assert.match(doc, /320/);
  assert.match(doc, /1440/);
  assert.match(doc, /44px touch targets/);
  assert.match(doc, /iOS Safari/);
  assert.match(doc, /Do not weaken these controls/);
});
