window.useOchilinkPublic = function useOchilinkPublic(React) {
    const [state, setState] = React.useState({ apps: [], pricing: null, loading: true, error: '' });
    const [attempt, setAttempt] = React.useState(0);
    React.useEffect(() => {
        const controller = new AbortController();
        setState(previous => ({ ...previous, loading: true, error: '' }));
        fetch('/api/hub?resource=public', { signal: controller.signal, cache: 'no-store' })
            .then(async response => {
                if (!response.ok) throw new Error('Apps are temporarily unavailable.');
                return response.json();
            })
            .then(data => setState({
                apps: data.apps.map(app => ({ ...app, desc: app.description, tags: app.tech,
                    status: app.status === 'Live' ? 'live' : 'soon', link: app.link || '#schedule',
                    icon: app.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase(), year: '' })),
                pricing: data.pricing, loading: false, error: ''
            }))
            .catch(error => {
                if (error.name !== 'AbortError') setState({ apps: [], pricing: null, loading: false, error: 'Apps are temporarily unavailable.' });
            });
        return () => controller.abort();
    }, [attempt]);
    return { ...state, reload: () => setAttempt(value => value + 1) };
};
window.OchilinkConsultation = function OchilinkConsultation({ React, onClose }) {
    const h = React.createElement;
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [sent, setSent] = React.useState(false);
    const ref = React.useRef(null);
    React.useEffect(() => {
        const previous = document.activeElement;
        ref.current?.querySelector('input')?.focus();
        const keydown = event => {
            if (event.key === 'Escape') { event.preventDefault(); onClose(); }
            if (event.key !== 'Tab') return;
            const dialog = ref.current?.parentElement;
            const fields = [...(dialog?.querySelectorAll('input,textarea,button,a[href]') || [])].filter(el => !el.disabled);
            const first = fields[0], last = fields[fields.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        const dialog = ref.current?.parentElement;
        dialog?.setAttribute('role', 'dialog');
        dialog?.setAttribute('aria-modal', 'true');
        dialog?.setAttribute('aria-label', 'Request a consultation');
        document.addEventListener('keydown', keydown);
        return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
    }, []);
    const inputStyle = { display: 'block', width: '100%', border: '1px solid #64748b', borderRadius: 10, padding: 10, marginTop: 6, background: 'transparent', color: 'inherit' };
    return h('div', { ref }, h('p', { style: { margin: '16px 0', fontSize: 13 } }, 'This is a request. Your appointment is confirmed separately by email.'),
        message && h('p', { role: 'status', style: { margin: '12px 0' } }, message),
        !sent && h('form', { onSubmit: async event => {
            event.preventDefault();
            const form = event.currentTarget;
            setBusy(true); setMessage('');
            try {
                const response = await fetch('/api/hub?resource=consultations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Request failed.');
                setSent(true); setMessage('Request received. We’ll contact you by email to discuss availability.');
            } catch (error) { setMessage(error.message || 'Unable to send your request. Please try again.'); }
            finally { setBusy(false); }
        } }, ...[
            ['Your name', 'client_name', 'text', 160], ['Email', 'client_email', 'email', 254]
        ].map(([label, name, type, maxLength]) => h('label', { key: name, style: { display: 'block', margin: '12px 0' } }, label,
            h('input', { name, type, maxLength, required: true, autoComplete: type === 'email' ? 'email' : 'name', style: inputStyle }))),
            h('label', null, 'What would you like help with?', h('textarea', { name: 'notes', maxLength: 3000, rows: 3, style: inputStyle })),
            h('button', { type: 'submit', disabled: busy, style: { marginTop: 16, padding: '10px 20px', borderRadius: 24, background: '#D6FF57', color: '#101416', fontWeight: 700 } }, busy ? 'Sending…' : 'Send request')));
};
