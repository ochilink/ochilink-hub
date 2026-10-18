import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isShowcaseMediaEnabled, createShowcaseUploadHandler } from '../api/showcase-upload.js';

test('showcase uploads fail closed for Production unless explicitly enabled', () => {
  assert.equal(isShowcaseMediaEnabled({ VERCEL_ENV: 'production' }), false);
  assert.equal(isShowcaseMediaEnabled({ VERCEL_ENV: 'production', SHOWCASE_MEDIA_ENABLED: 'false' }), false);
  assert.equal(isShowcaseMediaEnabled({ VERCEL_ENV: 'production', SHOWCASE_MEDIA_ENABLED: 'TRUE' }), false);
  assert.equal(isShowcaseMediaEnabled({ VERCEL_ENV: 'production', SHOWCASE_MEDIA_ENABLED: 'true' }), true);
});
test('Preview uploads stay available by default but respect explicit disable', () => {
  assert.equal(isShowcaseMediaEnabled({ VERCEL_ENV: 'preview' }), true);
  assert.equal(isShowcaseMediaEnabled({ VERCEL_ENV: 'preview', SHOWCASE_MEDIA_ENABLED: 'false' }), false);
  assert.equal(isShowcaseMediaEnabled({ VERCEL_ENV: 'development', SHOWCASE_MEDIA_ENABLED: 'true' }), false);
});
test('disabled upload gate rejects before any database or Blob access', async () => {
  const previous = process.env.VERCEL_ENV;
  const previousFlag = process.env.SHOWCASE_MEDIA_ENABLED;
  process.env.VERCEL_ENV = 'production';
  delete process.env.SHOWCASE_MEDIA_ENABLED;
  let touched = false;
  const handler = createShowcaseUploadHandler({
    poolProvider: () => { touched = true; throw Error('Database must not be used'); },
    store: async () => { touched = true; throw Error('Blob must not be used'); },
  });
  const response = {
    headers: {}, statusCode: 200, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  try {
    await handler({ method: 'POST', headers: {}, query: {} }, response);
    assert.equal(response.statusCode, 404);
    assert.equal(touched, false);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    if (previousFlag === undefined) delete process.env.SHOWCASE_MEDIA_ENABLED;
    else process.env.SHOWCASE_MEDIA_ENABLED = previousFlag;
  }
});
