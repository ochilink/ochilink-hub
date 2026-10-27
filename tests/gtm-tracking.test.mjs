import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

async function nextTick() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
}

test('GTM does not load without analytics consent', async () => {
    const script = await readFile('public/assets/hub-tracking.js', 'utf8');
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        url: 'https://hub.test/',
        runScripts: 'outside-only',
    });
    dom.window.fetch = async () => ({
        ok: true,
        json: async () => ({ container_id: 'GTM-TEST123' }),
    });
    dom.window.eval(script);
    await nextTick();
    assert.equal(dom.window.document.querySelector('script[data-ochilink-gtm]'), null);
    assert.equal(dom.window.dataLayer, undefined);
    dom.window.close();
});

test('GTM loads after consent and strips sensitive event fields', async () => {
    const script = await readFile('public/assets/hub-tracking.js', 'utf8');
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        url: 'https://hub.test/',
        runScripts: 'outside-only',
    });
    dom.window.localStorage.setItem('ochi-analytics-consent', 'yes');
    dom.window.fetch = async () => ({
        ok: true,
        json: async () => ({ container_id: 'GTM-TEST123' }),
    });
    dom.window.eval(script);
    await nextTick();

    const tag = dom.window.document.querySelector('script[data-ochilink-gtm]');
    assert.ok(tag);
    assert.match(tag.src, /googletagmanager\.com\/gtm\.js\?id=GTM-TEST123/);

    dom.window.OchilinkTracking.track('ochilink_test_event', {
        section: 'rental',
        action: 'submit',
        result: 'success',
        email: 'private@example.test',
        document_name: 'lease.pdf',
        payment_amount: '154.65',
    });
    await nextTick();

    const event = dom.window.dataLayer.find((entry) => entry?.event === 'ochilink_test_event');
    assert.deepEqual(
        { section: event.section, action: event.action, result: event.result },
        { section: 'rental', action: 'submit', result: 'success' },
    );
    assert.equal('email' in event, false);
    assert.equal('document_name' in event, false);
    assert.equal('payment_amount' in event, false);
    dom.window.close();
});

test('public surfaces use shared consent-gated tracking instead of direct gtag', async () => {
    const [landing, rental, account, booking, api, env] = await Promise.all([
        readFile('public/index.html', 'utf8'),
        readFile('public/rental-application/index.html', 'utf8'),
        readFile('public/account/index.html', 'utf8'),
        readFile('public/booking/index.html', 'utf8'),
        readFile('api/hub.js', 'utf8'),
        readFile('.env.example', 'utf8'),
    ]);

    assert.match(landing, /\/assets\/hub-tracking\.js/);
    assert.doesNotMatch(landing, /googletagmanager\.com\/gtag\/js/);
    assert.doesNotMatch(landing, /gtag\('config'/);
    assert.match(rental, /ochilink_rental_checkout_started/);
    assert.match(rental, /ochilink_rental_payment_verified/);
    assert.match(account, /ochilink_customer_vault_opened/);
    assert.match(account, /ochilink_document_opened/);
    assert.match(booking, /ochilink_consultation_payment_returned/);
    assert.match(api, /resource === 'tracking-config'/);
    assert.match(api, /GTM_CONTAINER_ID/);
    assert.match(env, /GTM_CONTAINER_ID=/);
});


test('tracking bootstrap uses standard GTM script insertion semantics', async () => {
    const script = await readFile('public/assets/hub-tracking.js', 'utf8');
    assert.match(script, /getElementsByTagName\('script'\)\[0\]/);
    assert.match(script, /insertBefore\(script, firstScript\)/);
    assert.match(script, /googletagmanager\.com\/gtm\.js\?id=/);
});
