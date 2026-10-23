import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('production admin UI does not expose live Stripe smoke-test controls', () => {
  const html = fs.readFileSync(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  assert.equal(html.includes('hub-live-smoke-control.js'), false);
  assert.equal(html.includes('OchilinkLiveSmokeControl'), false);
  assert.equal(html.includes('LIVE PAYMENT VERIFICATION — INTERNAL ONLY'), false);
  assert.equal(html.includes('Prepare $1 live test checkout'), false);
});
