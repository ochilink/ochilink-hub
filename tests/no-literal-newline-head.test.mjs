import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = [
  '../public/index.html',
  '../public/admin/index.html',
  '../public/admin/previews/index.html',
  '../public/admin/rentals/index.html',
  '../public/account/index.html',
  '../public/rental-application/index.html',
  '../public/rental-application/thank-you/index.html',
];

test('public HTML heads do not contain visible literal backslash-n sequences', () => {
  for (const page of pages) {
    const html = fs.readFileSync(new URL(page, import.meta.url), 'utf8');
    const head = html.split('</head>')[0] || html;
    assert.equal(
      head.includes('\\n'),
      false,
      page + ' contains a literal \\n in <head>',
    );
  }
});
