import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
async function waitFor(fn) {
    for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.fail('UI did not reach expected state');
}
async function page(file, fetch) {
    const html = await readFile(file, 'utf8');
    const dom = new JSDOM(html, { url: 'https://hub.test', runScripts: 'outside-only', pretendToBeVisual: true });
    dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    dom.window.fetch = fetch;
    dom.window.confirm = () => true;
    dom.window.HTMLElement.prototype.scrollIntoView = () => {};
    const external = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)];
    for (const [, src] of external) dom.window.eval(await readFile('public' + src, 'utf8'));
    dom.window.eval(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
    return dom;
}
const result = body => Promise.resolve({ ok: true, status: 200, json: async () => body });
test('landing renders database apps, counts, pricing and a working request form', async () => {
    let requests = 0;
    const dom = await page('public/index.html', async (url, options) => {
        if (url.includes('consultations')) { requests++; assert.equal(JSON.parse(options.body).client_email, 'visitor@example.test'); return result({ ok: true }); }
        return result({ apps: [{ id: '1', name: 'Database app', description: 'From PostgreSQL', tech: ['Node'], status: 'Live', link: 'https://example.test' }], pricing: { hourly: 95, minimum: 190 } });
    });
    try {
        const { document } = dom.window;
        await waitFor(() => document.body.textContent.includes('Database app'));
        assert.match(document.body.textContent, /\$95/);
        assert.doesNotMatch(document.body.textContent, /Fitness|\$75|\$150|5 ACTIVE/);
        const button = [...document.querySelectorAll('button')].find(el => el.textContent === 'Schedule Consultation');
        button.click();
        await waitFor(() => document.querySelector('input[name=client_name]'));
        document.querySelector('input[name=client_name]').value = 'Visitor';
        document.querySelector('input[name=client_email]').value = 'visitor@example.test';
        document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await waitFor(() => document.body.textContent.includes('Request received'));
        assert.equal(requests, 1);
    } finally { dom.window.close(); }
});
test('landing shows API failure and retry instead of sample apps', async () => {
    const dom = await page('public/index.html', () => Promise.resolve({ ok: false }));
    try { await waitFor(() => dom.window.document.body.textContent.includes('Apps are temporarily unavailable.')); assert.match(dom.window.document.body.textContent, /Retry/); }
    finally { dom.window.close(); }
});
test('admin login renders without demo credentials and loads persisted apps after signing in', async () => {
    let signedIn = false;
    const dom = await page('public/admin/index.html', (url, options) => {
        if (url.includes('session')) return result({ user: null });
        if (url.includes('login')) { signedIn = true; return result({ user: { id: 'admin', email: 'owner@example.test', role: 'admin' } }); }
        assert.ok(signedIn);
        return result({ apps: [{ id: '1', name: 'Persisted app', description: 'Saved', tech: [], status: 'Live', is_published: true }], users: [], logs: [], errors: [], consultations: [], pricing: { hourly: 75, minimum: 150 } });
    });
    try {
        const { document } = dom.window;
        await waitFor(() => document.querySelector('input[name=email]'));
        assert.doesNotMatch(document.body.textContent, /demo|MFA|99\.97/);
        document.querySelector('input[name=email]').value = 'owner@example.test';
        document.querySelector('input[name=password]').value = 'private-password';
        document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await waitFor(() => document.body.textContent.includes('Persisted app'));
        [...document.querySelectorAll('button')].find(el => el.textContent === 'Add app').click();
        await waitFor(() => document.body.textContent.includes('New app'));
        assert.match(document.body.textContent, /Publish on website/);
    } finally { dom.window.close(); }
});
