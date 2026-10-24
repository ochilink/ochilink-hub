import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('global loader assets are installed on all primary Ochilink surfaces', () => {
  for (const path of [
    'public/index.html',
    'public/booking/index.html',
    'public/admin/index.html',
  ]) {
    const html = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    assert.match(html, /\/assets\/hub-loader\.css/);
    assert.match(html, /\/assets\/hub-loader\.js/);
  }
});

test('global loader is accessible, delayed and motion-aware', () => {
  const js = fs.readFileSync(
    new URL('../public/assets/hub-loader.js', import.meta.url),
    'utf8',
  );
  const css = fs.readFileSync(
    new URL('../public/assets/hub-loader.css', import.meta.url),
    'utf8',
  );

  assert.match(js, /role', 'status'/);
  assert.match(js, /aria-live', 'polite'/);
  assert.match(js, /aria-busy/);
  assert.match(js, /delay: 80/);
  assert.match(js, /window\.OchilinkLoader = \{ start, stop, track, inline \}/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.ochi-spinner/);
  assert.match(css, /\.ochi-inline-spinner/);
});

test('important user actions use the global loader while silent refresh remains separate', () => {
  const admin = fs.readFileSync(
    new URL('../public/assets/hub-admin.js', import.meta.url),
    'utf8',
  );
  const booking = fs.readFileSync(
    new URL('../public/assets/hub-booking.js', import.meta.url),
    'utf8',
  );
  const pub = fs.readFileSync(
    new URL('../public/assets/hub-public.js', import.meta.url),
    'utf8',
  );

  assert.match(admin, /Signing you in…/);
  assert.match(admin, /Saving changes…/);
  assert.match(admin, /Signing out…/);
  assert.match(booking, /Opening secure checkout…/);
  assert.match(pub, /Loading apps & services…/);
  assert.match(pub, /Loading availability…/);
  assert.match(pub, /Sending consultation request…/);
  assert.match(pub, /Loading payment details…/);
  assert.doesNotMatch(admin, /setInterval\([\s\S]*OchilinkLoader/);
});
