import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';
async function waitFor(fn) {
    for (let i = 0; i < 100; i++) {
        if (fn()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail('UI did not reach expected state');
}
async function page(file, fetch) {
    const html = await readFile(file, 'utf8');
    const dom = new JSDOM(html, {
        url: 'https://hub.test',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
    });
    dom.window.matchMedia = () => ({
        matches: false,
        addListener() {},
        removeListener() {},
    });
    dom.window.fetch = fetch;
    dom.window.confirm = () => true;
    dom.window.HTMLElement.prototype.scrollIntoView = () => {};
    const external = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)];
    for (const [, src] of external)
        dom.window.eval(await readFile('public' + src, 'utf8'));
    dom.window.eval(
        html.match(/<script type="module">([\s\S]*?)<\/script>/)[1],
    );
    return dom;
}
const result = (body) =>
    Promise.resolve({ ok: true, status: 200, json: async () => body });
test('landing renders database catalog and pricing with the login navigation', async () => {
    let requests = 0;
    const dom = await page('public/index.html', async (url, options) => {
        if (url.includes('availability')) return result({ slots: [] });
        if (url.includes('consultations')) {
            requests++;
            assert.equal(
                JSON.parse(options.body).client_email,
                'visitor@example.test',
            );
            return result({ ok: true });
        }
        return result({
            apps: [
                {
                    id: '1',
                    name: 'Database app',
                    description: 'From PostgreSQL',
                    tech: ['Node'],
                    status: 'Live',
                    link: 'https://example.test',
                },
            ],
            pricing: { hourly: 95, minimum: 190 },
        });
    });
    try {
        const { document } = dom.window;
        await waitFor(() => document.body.textContent.includes('Database app'));
        assert.match(document.body.textContent, /\$95/);
        assert.doesNotMatch(
            document.body.textContent,
            /Fitness|\$75|\$150|5 ACTIVE/,
        );
        const button = [...document.querySelectorAll('button')].find(el => el.textContent === 'Schedule Consultation');
        assert.match(button.getAttribute('class'), /rounded-full/);
        assert.equal(document.querySelector('a[href="/admin/"]').textContent, 'Login →');
        assert.equal(requests, 0);
    } finally {
        dom.window.close();
    }
});
test('landing shows API failure and retry instead of sample apps', async () => {
    const dom = await page('public/index.html', () =>
        Promise.resolve({ ok: false }),
    );
    try {
        await waitFor(() =>
            dom.window.document.body.textContent.includes(
                'Apps are temporarily unavailable.',
            ),
        );
        assert.match(dom.window.document.body.textContent, /Retry/);
    } finally {
        dom.window.close();
    }
});
test('admin login renders without demo credentials and loads persisted apps after signing in', async () => {
    let signedIn = false;
    const dom = await page('public/admin/index.html', (url, options) => {
        if (url.includes('session')) return result({ user: null });
        if (url.includes('login')) {
            signedIn = true;
            return result({
                user: {
                    id: 'admin',
                    email: 'owner@example.test',
                    role: 'admin',
                },
            });
        }
        assert.ok(signedIn);
        return result({
            apps: [
                {
                    id: '1',
                    name: 'Persisted app',
                    description: 'Saved',
                    tech: [],
                    status: 'Live',
                    is_published: true,
                },
            ],
            users: [],
            logs: [],
            errors: [],
            consultations: [],
            pricing: { hourly: 75, minimum: 150 },
        });
    });
    try {
        const { document } = dom.window;
        await waitFor(() => document.querySelector('input[name=email]'));
        assert.doesNotMatch(
            document.getElementById('root').textContent,
            /demo|MFA|99\.97/,
        );
        assert.match(document.getElementById('root').textContent, /Caribbean/);
        assert.ok(
            document.querySelector(
                '.grid.md\\:grid-cols-\\[1\\.1fr_0\\.9fr\\]',
            ) || document.querySelector('[class*="md:grid-cols-"]'),
        );
        const setValue = (selector, value) => {
            const input = document.querySelector(selector);
            Object.getOwnPropertyDescriptor(
                dom.window.HTMLInputElement.prototype,
                'value',
            ).set.call(input, value);
            input.dispatchEvent(
                new dom.window.Event('input', { bubbles: true }),
            );
        };
        setValue('input[name=email]', 'owner@example.test');
        setValue('input[name=password]', 'private-password');
        document
            .querySelector('form')
            .dispatchEvent(
                new dom.window.Event('submit', {
                    bubbles: true,
                    cancelable: true,
                }),
            );
        await waitFor(() => document.querySelector('aside'));
        const navApps = [...document.querySelectorAll('aside nav button')].find(
            (el) => el.textContent.includes('Apps'),
        );
        navApps.click();
        await waitFor(() =>
            document
                .getElementById('root')
                .textContent.includes('Persisted app'),
        );
        [...document.querySelectorAll('button')]
            .find((el) => el.textContent === '+ New App')
            .click();
        await waitFor(() =>
            document.getElementById('root').textContent.includes('ADD NEW APP'),
        );
        assert.ok(document.querySelector('aside'));
        assert.match(
            document.getElementById('root').textContent,
            /Security Logs/,
        );
        assert.match(document.body.textContent, /Publish on website/);
    } finally {
        dom.window.close();
    }
});

test('admin retains complete inline stylesheet and approved Ochilink green tokens', async () => {
    const html = await readFile('public/admin/index.html', 'utf8');
    const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.ok(style.length > 10000);
    assert.match(style, /--lime:#447E37/);
    assert.match(style, /--lime-glow:rgba\(68,126,55,/);
    assert.ok(!html.includes('hub-admin.css'));
});
test('original Forgot control opens the functional password recovery form', async () => {
    let requested;
    const dom = await page('public/admin/index.html', (url, options) => {
        if (url.includes('session')) return result({ user: null });
        if (url.includes('recovery')) {
            requested = JSON.parse(options.body);
            return result({ ok: true });
        }
        return result({});
    });
    try {
        const document = dom.window.document;
        await waitFor(() =>
            [...document.querySelectorAll('button')].some(
                (b) => b.textContent === 'Forgot?',
            ),
        );
        [...document.querySelectorAll('button')]
            .find((b) => b.textContent === 'Forgot?')
            .click();
        await waitFor(() =>
            document.querySelector('[aria-label="Password recovery"]'),
        );
        const region = document.querySelector(
            '[aria-label="Password recovery"]',
        );
        region.querySelector('input').value = 'owner@example.test';
        region
            .querySelector('form')
            .dispatchEvent(
                new dom.window.Event('submit', {
                    bubbles: true,
                    cancelable: true,
                }),
            );
        await waitFor(() =>
            region.textContent.includes('reset email has been queued'),
        );
        assert.equal(requested.email, 'owner@example.test');
    } finally {
        dom.window.close();
    }
});
test('existing Settings navigation loads MFA and email delivery controls in original layout', async () => {
    const admin = {
        apps: [],
        users: [],
        logs: [],
        errors: [],
        consultations: [],
        pricing: { hourly: 75, minimum: 150 },
        activity: [],
        totals: {},
    };
    const dom = await page('public/admin/index.html', (url) => {
        if (url.includes('session'))
            return result({
                user: {
                    id: 'admin',
                    email: 'owner@example.test',
                    role: 'admin',
                    expires_at: new Date(Date.now() + 900000).toISOString(),
                },
            });
        if (url.includes('analytics-admin'))
            return result({ clicks: [], scroll: [], pages: [] });
        if (url.includes('email-outbox'))
            return result({ configured: false, emails: [] });
        if (url.includes('mfa'))
            return result({
                enabled: false,
                configured: true,
                recovery_codes_remaining: 0,
            });
        return result(admin);
    });
    try {
        const document = dom.window.document;
        await waitFor(() => document.querySelector('aside'));
        [...document.querySelectorAll('aside nav button')]
            .find((b) => b.textContent.includes('Settings'))
            .click();
        await waitFor(() =>
            document
                .querySelector('#root')
                .textContent.includes('AUTHENTICATOR MFA'),
        );
        assert.match(
            document.querySelector('#root').textContent,
            /CONSULTATION PRICING/,
        );
        assert.match(
            document.querySelector('#root').textContent,
            /AUTOMATED EMAILS/,
        );
        assert.ok(document.querySelector('aside'));
    } finally {
        dom.window.close();
    }
});
test('analytics waits for consent before submitting visitor events', async () => {
    let tracked = 0;
    const dom = await page('public/index.html', (url) => {
        if (url.includes('analytics')) {
            tracked++;
            return result({ ok: true });
        }
        return result({ apps: [], pricing: null });
    });
    try {
        const document = dom.window.document;
        await waitFor(() =>
            document
                .querySelector('#root')
                .textContent.includes('Allow analytics'),
        );
        assert.equal(tracked, 0);
        [...document.querySelectorAll('button')]
            .find((b) => b.textContent === 'Allow analytics')
            .click();
        await waitFor(() => tracked > 0);
        await waitFor(() =>
            !document.querySelector('#root').textContent.includes('Allow analytics'),
        );
        assert.equal(
            [...document.querySelectorAll('button')].some(
                (b) => b.textContent === 'Privacy choices',
            ),
            false,
        );
    } finally {
        dom.window.close();
    }
});

test('booking renders live slots, real booked state, pricing and landing navbar', async () => {
    const dom = await page('public/booking/index.html', async url => {
        if (url === '/api/availability') return result({ slots: [{ id: 'available', starts_at: '2026-10-20T14:00:00Z', ends_at: '2026-10-20T17:00:00Z' }], booked_slots: [{id:'busy', starts_at:'2026-10-20T18:00:00Z',ends_at:'2026-10-20T19:00:00Z',is_booked:true}] });
        return result({pricing:{hourly:95,minimum:190}});
    });
    try {
        const d = dom.window.document;
        await waitFor(() => d.body.textContent.includes('10:00 AM EDT'));
        assert.equal(d.querySelector('a[href="/admin/"]').textContent, 'Login →');
        assert.match(d.body.textContent, /\$190/);
        assert.match(d.body.textContent, /Continue to Payment/);
        assert.doesNotMatch(d.body.textContent, /No charge now|Payment arranged separately/);
        assert.doesNotMatch(d.body.textContent, /in-memory|No backend|coming soon|Calendar synced/);
        const booked = [...d.querySelectorAll('button')].find(b => b.textContent.includes('Booked'));
        assert.equal(booked.disabled, true);
        const three = [...d.querySelectorAll('button')].find(b => b.textContent.includes('3 hours'));
        three.click();
        await waitFor(() => d.body.textContent.includes('$285'));
        assert.equal(d.querySelector('header').textContent.includes('ramone@'), false);
    } finally { dom.window.close(); }
});

test('mobile record cards retain labeled consultation and error fields after navigation', async () => {
    const identifier = 'reference_' + 'x'.repeat(120);
    const data = {
        apps: [], users: [], logs: [], activity: [], totals: {},
        pricing: { hourly: 75, minimum: 150 },
        consultations: [{ id: 'booking', client_name: 'Mobile Client', client_email: 'client@example.test', scheduled_at: '2026-10-20T14:00:00Z', duration_minutes: 120, amount: 150, status: 'Scheduled', payment_status: 'Paid' }],
        errors: [{ id: 'error', created_at: new Date().toISOString(), severity: 'ERROR', service: 'booking', message: identifier, path: '/api/consultations' }],
    };
    const dom = await page('public/admin/index.html', url => {
        if (url.includes('session')) return result({ user: { id: 'admin', role: 'admin', email: 'owner@example.test' } });
        if (url.includes('analytics-admin')) return result({ clicks: [], scroll: [], pages: [] });
        if (url.includes('availability-admin')) return result({ slots: [] });
        return result(data);
    });
    try {
        const d = dom.window.document;
        await waitFor(() => d.querySelector('aside nav'));
        const go = name => [...d.querySelectorAll('aside nav button')].find(b => b.textContent.includes(name)).click();
        go('Consultations');
        await waitFor(() => d.querySelector('td[data-label="CLIENT"]'));
        assert.match(d.querySelector('td[data-label="CLIENT"]').textContent, /Mobile Client.*client@example.test/);
        assert.match(d.querySelector('td[data-label="AMOUNT"]').textContent, /150/);
        assert.equal(d.querySelector('table').getAttribute('role'), 'table');
        assert.ok(d.querySelector('.mobile-availability-form'));
        go('Error Logs');
        await waitFor(() => d.querySelector('td[data-label="MESSAGE"]'));
        assert.equal(d.querySelector('td[data-label="MESSAGE"]').textContent, identifier);
        assert.equal(d.querySelector('td[data-label="PATH"]').textContent, '/api/consultations');
    } finally { dom.window.close(); }
});


test('customer vault uses a mobile hamburger drawer instead of stacking the sidebar', async () => {
    const html = await readFile('public/account/index.html', 'utf8');
    assert.match(html, /id="menuBtn"/);
    assert.match(html, /id="vaultSidebar"/);
    assert.match(html, /id="sidebarBackdrop"/);
    assert.match(html, /\.shell\.menu-open aside\{transform:translateX\(0\)\}/);
    assert.match(html, /@media\(max-width:900px\)/);
    assert.match(html, /setMenu\(false\)/);
});


test('landing mobile controls stack search below filters and footer uses Ochilink logo asset', async () => {
    const html = await readFile('public/index.html', 'utf8');
    assert.match(html, /apps-filter-controls/);
    assert.match(html, /apps-search-input/);
    assert.match(html, /@media\(max-width:767px\)[\s\S]*\.apps-filter-controls[\s\S]*flex-direction:column/);
    assert.match(html, /footer-ochilink-logo/);
    assert.match(html, /\/assets\/ochilink-final-logo\.svg/);
});


test('landing hero stats use stable label keys during loading', async () => {
    const html = await readFile('public/index.html', 'utf8');
    assert.match(html, /Published Apps/);
    assert.match(html, /Live Now/);
    assert.match(html, /Consultation/);
    assert.doesNotMatch(html, /\}\,h\.k\)\)/);
    assert.match(html, /\}\,h\.v\)\)/);
});


test('footer exposes a direct rental application link', async () => {
    const html = await readFile('public/index.html', 'utf8');
    assert.match(html, /href:"\/rental-application\//);
    assert.match(html, /children:"Rental Application"/);
});


test('footer links to the public contact page and Instagram profiles', async () => {
    const html = await readFile('public/index.html', 'utf8');
    assert.match(html, /href:"\/contact\//);
    assert.match(html, /children:"Contact Ochilink"/);
    assert.match(html, /instagram\.com\/ramonemiami\//);
    assert.match(html, /instagram\.com\/rowprorealty\//);
});

test('contact page exposes Ochilink contact options', async () => {
    const html = await readFile('public/contact/index.html', 'utf8');
    assert.match(html, /Contact Ochilink/);
    assert.match(html, /mailto:ramone@ochilink\.com/);
    assert.match(html, /href="\/booking\//);
    assert.match(html, /instagram\.com\/ramonemiami\//);
    assert.match(html, /instagram\.com\/rowprorealty\//);
});
