import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('app card status footers align despite wrapped technology tags', () => {
  const page = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(page, /w-full h-full flex flex-col/);
  assert.match(page, /mt-auto pt-5 flex items-center gap-2 text-\[12px\]/);
});
