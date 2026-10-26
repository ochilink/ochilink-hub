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


test('public Login routes customers to the customer account, not Admin', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const loginIndex = html.indexOf('children:"Login →"');
  assert.ok(loginIndex > 0, 'public Login label should exist');
  const context = html.slice(Math.max(0, loginIndex - 700), loginIndex + 100);
  assert.ok(context.includes('href:"/account/"'), 'public Login should target /account/');
  assert.equal(context.includes('href:"/admin/"'), false, 'public Login must not target /admin/');
});
