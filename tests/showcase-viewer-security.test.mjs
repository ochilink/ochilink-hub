import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/admin/media-dashboard.js', import.meta.url), 'utf8');

test('visual showcase uses a sandboxed iframe without elevated permissions', () => {
  assert.match(source, /createElement\('iframe'\)/);
  assert.match(source, /viewer\.setAttribute\('sandbox',\s*''\)/);
  assert.doesNotMatch(source, /allow-scripts|allow-same-origin|allow-forms|allow-popups|allow-top-navigation/);
  assert.match(source, /viewer\.setAttribute\('referrerpolicy',\s*'no-referrer'\)/);
});
test('viewer applies restrictive CSP to untrusted srcdoc content', () => {
  assert.match(source, /Content-Security-Policy/);
  for (const directive of ["default-src", "form-action", "base-uri"]) {
    assert.ok(source.includes(directive), directive + ' must be present');
  }
  assert.match(source, /img-src data:/);
  assert.doesNotMatch(source, /script-src\s+[^;]*unsafe-inline/);
  assert.doesNotMatch(source, /connect-src\s+\*/);
});
test('viewer accepts only authenticated HTML text or approved image types without executing HTML directly', () => {
  assert.match(source, /fetch\('\/api\/showcase-preview\?app_id='/);
  assert.match(source, /credentials:\s*'same-origin'/);
  assert.match(source, /cache:\s*'no-store'/);
  assert.match(source, /mime === 'text\/plain'/);
  assert.match(source, /\['image\/png', 'image\/jpeg', 'image\/webp'\]\.includes\(mime\)/);
  assert.match(source, /URL\.createObjectURL\(blob\)/);
  assert.match(source, /viewer\.srcdoc\s*=\s*policy\s*\+\s*html/);
  assert.doesNotMatch(source, /document\.write\(|eval\(|new Function\(/);
});
test('viewer clears untrusted content when selection changes or preview closes', () => {
  assert.match(source, /closePreview\.addEventListener\('click'/);
  assert.match(source, /select\.addEventListener\('change'/);
  assert.match(source, /function clearPreview\(\)/);
  const matches = source.match(/clearPreview\(\)/g) || [];
  assert.ok(matches.length >= 3);
  assert.match(source, /viewer\.removeAttribute\('srcdoc'\)/);
  assert.match(source, /URL\.revokeObjectURL\(imageUrl\)/);
});
