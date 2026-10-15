/* Ochilink Hub admin. React is supplied by the existing bundled page. */
window.OchilinkAdmin = function OchilinkAdmin({ React }) {
    const h = React.createElement;
    const [user, setUser] = React.useState(null);
    const [checking, setChecking] = React.useState(true);
    const [data, setData] = React.useState(null);
    const [tab, setTab] = React.useState('Apps');
    const [message, setMessage] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [draft, setDraft] = React.useState(null);
    const [search, setSearch] = React.useState('');
    const [theme, setTheme] = React.useState(() => localStorage.getItem('ochi-theme') || 'dark');
    React.useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('ochi-theme', theme); }, [theme]);
    async function api(resource, method = 'GET', body) {
        const response = await fetch('/api/hub?resource=' + resource, {
            method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        let result;
        try { result = await response.json(); } catch { throw new Error('The server returned an unexpected response.'); }
        if (!response.ok) {
            if (response.status === 401 && resource !== 'login') { setUser(null); setData(null); }
            throw new Error(result.error || 'Request failed.');
        }
        return result;
    }
    async function refresh() { setData(await api('admin')); }
    React.useEffect(() => {
        let active = true;
        api('session').then(result => { if (active) setUser(result.user); })
            .catch(error => { if (active) setMessage(error.message); })
            .finally(() => { if (active) setChecking(false); });
        return () => { active = false; };
    }, []);
    React.useEffect(() => {
        if (!user) return;
        refresh().catch(error => setMessage(error.message));
        const interval = setInterval(() => refresh().catch(error => setMessage(error.message)), 60000);
        return () => clearInterval(interval);
    }, [user?.id]);
    async function action(fn, success) {
        setBusy(true); setMessage('');
        try { await fn(); if (success) setMessage(success); }
        catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
    }
    function field(label, props) {
        return h('label', { className: 'hub-field' }, label, h('input', { ...props }));
    }
    function table(headings, rows) {
        return rows.length ? h('div', { className: 'hub-scroll' }, h('table', null,
            h('thead', null, h('tr', null, ...headings.map(label => h('th', { key: label }, label)))),
            h('tbody', null, ...rows.map((row, i) => h('tr', { key: i }, ...row.map((cell, j) => h('td', { key: j }, cell)))))))
            : h('p', { className: 'hub-empty' }, 'No records yet.');
    }
    const button = (label, onClick, more = {}) => h('button', { type: 'button', onClick, disabled: busy, ...more }, label);
    const time = value => value ? new Date(value).toLocaleString() : '—';
    const header = h('header', { className: 'hub-header' }, h('a', { href: '/' }, 'OCHILINK'),
        h('span', null, 'ADMIN'), h('div', { className: 'hub-spacer' }),
        button(theme === 'dark' ? 'Light mode' : 'Dark mode', () => setTheme(theme === 'dark' ? 'light' : 'dark')),
        user && button('Sign out', () => action(async () => { await api('logout', 'POST', {}); setUser(null); setData(null); setDraft(null); }, 'Signed out.')));
    const notice = message && h('p', { role: 'status', className: 'hub-notice' }, message);
    if (checking) return h('div', { className: 'hub-shell' }, header, h('main', null, 'Checking session…'));
    if (!user) return h('div', { className: 'hub-shell' }, header, h('main', { className: 'hub-login' },
        h('div', { className: 'hub-panel' }, h('h1', null, 'Admin access'),
            h('p', null, 'Sign in with your Ochilink administrator account. Sessions expire after 15 minutes.'), notice,
            h('form', { onSubmit: event => {
                event.preventDefault(); const form = new FormData(event.currentTarget);
                action(async () => { const result = await api('login', 'POST', Object.fromEntries(form)); setUser(result.user); }, 'Signed in.');
            } }, field('Email', { name: 'email', type: 'email', required: true, autoComplete: 'username', maxLength: 254 }),
            field('Password', { name: 'password', type: 'password', required: true, autoComplete: 'current-password' }),
            h('button', { type: 'submit', disabled: busy }, busy ? 'Signing in…' : 'Sign in')))));
    let content;
    if (!data) content = h('p', null, 'Loading database records…');
    else if (tab === 'Apps') content = h(React.Fragment, null,
        h('div', { className: 'hub-toolbar' }, h('input', { type: 'search', placeholder: 'Search apps', 'aria-label': 'Search apps', value: search, onChange: e => setSearch(e.target.value) }),
            button('Add app', () => setDraft({ name: '', slug: '', description: '', link: '', tech: [], status: 'Coming Soon', is_published: false, sort_order: 0 }))),
        table(['Name', 'Status', 'Published', 'Actions'], data.apps.filter(app => app.name.toLowerCase().includes(search.toLowerCase())).map(app => [
            h('div', null, h('strong', null, app.name), h('small', null, app.description)), app.status, app.is_published ? 'Yes' : 'No',
            h('div', { className: 'hub-actions' }, button('Edit', () => setDraft({ ...app })), button('Delete', () => {
                if (confirm('Delete ' + app.name + '?')) action(async () => { await api('apps', 'DELETE', { id: app.id }); await refresh(); }, 'App deleted.');
            }))
        ])),
        draft && h('form', { className: 'hub-panel', onSubmit: event => {
            event.preventDefault(); action(async () => {
                await api('apps', draft.id ? 'PUT' : 'POST', draft); setDraft(null); await refresh();
            }, 'App saved. Published changes appear on the public page when refreshed.');
        } }, h('h2', null, draft.id ? 'Edit app' : 'New app'),
            ...['name', 'slug', 'description', 'link'].map(key => field(key === 'link' ? 'HTTPS link (optional)' : key, {
                key, value: draft[key] || '', required: key === 'name', maxLength: key === 'description' ? 2000 : key === 'link' ? 2048 : key === 'slug' ? 160 : 120,
                onChange: e => setDraft({ ...draft, [key]: e.target.value })
            })), field('Technologies (comma-separated)', { value: draft.tech.join(', '), onChange: e => setDraft({ ...draft, tech: e.target.value.split(',').map(x => x.trim()) }) }),
            h('label', { className: 'hub-field' }, 'Status', h('select', { value: draft.status, onChange: e => setDraft({ ...draft, status: e.target.value }) },
                ...['Live', 'Coming Soon'].map(status => h('option', { key: status }, status)))),
            field('Display order', { type: 'number', value: draft.sort_order, onChange: e => setDraft({ ...draft, sort_order: Number(e.target.value) }) }),
            h('label', { className: 'hub-check' }, h('input', { type: 'checkbox', checked: draft.is_published, onChange: e => setDraft({ ...draft, is_published: e.target.checked }) }), 'Publish on website'),
            h('div', { className: 'hub-actions' }, h('button', { type: 'submit', disabled: busy }, 'Save app'), button('Cancel', () => setDraft(null)))));
    else if (tab === 'Users') content = table(['Email', 'Role', 'Active', 'Created'], data.users.map(row => [row.email, row.role, row.is_active ? 'Yes' : 'No', time(row.created_at)]));
    else if (tab === 'Security') content = table(['Time', 'Event', 'Actor'], data.logs.map(row => [time(row.timestamp), row.event_type, data.users.find(u => u.id === row.actor_id)?.email || 'Anonymous / unavailable']));
    else if (tab === 'Errors') content = table(['Time', 'Severity', 'Service', 'Message'], data.errors.map(row => [time(row.created_at), row.severity, row.service, row.message]));
    else if (tab === 'Consultations') content = table(['Client / email', 'Scheduled', 'Status', 'Payment'], data.consultations.map(row => [h('div',null,row.client_name,h('small',null,row.client_email)), time(row.scheduled_at), row.status, row.payment_status]));
    else if (tab === 'Settings') content = h('form', { key: JSON.stringify(data.pricing), className: 'hub-panel', onSubmit: event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        action(async () => { await api('pricing', 'PUT', { hourly: Number(form.get('hourly')), minimum: Number(form.get('minimum')) }); await refresh(); }, 'Pricing saved.');
    } }, h('h2', null, 'Consultation pricing (USD)'), field('Hourly rate', { name: 'hourly', type: 'number', min: 0, max: 100000, step: '0.01', required: true, defaultValue: data.pricing?.hourly }),
        field('Minimum', { name: 'minimum', type: 'number', min: 0, max: 100000, step: '0.01', required: true, defaultValue: data.pricing?.minimum }), h('button', { type: 'submit', disabled: busy }, 'Save pricing'));
    return h('div', { className: 'hub-shell' }, header, h('main', null,
        h('p', null, user.email), h('nav', { 'aria-label': 'Admin sections', className: 'hub-tabs' },
            ...['Apps', 'Users', 'Security', 'Errors', 'Consultations', 'Settings'].map(label => button(label, () => { setTab(label); setDraft(null); }, { key: label, 'aria-current': tab === label ? 'page' : undefined }))),
        notice, h('div', { className: 'hub-toolbar' }, h('h1', null, tab), button('Refresh', () => action(refresh, 'Updated.'))), content));
};
