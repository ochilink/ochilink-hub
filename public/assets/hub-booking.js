window.useOchilinkBooking = function (React) {
    const [state, setState] = React.useState({ slots: [], pricing: null, loading: true, error: '' });
    const token = React.useRef(sessionStorage.getItem('ochilink-booking-token') || '');
    const [busy, setBusy] = React.useState(false);
    const date = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
    const time = value => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
    async function request(url, options = {}) {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(25000), ...options });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load booking details.');
        return data;
    }
    async function refresh() {
        try {
            const [availability, catalog] = await Promise.all([request('/api/availability'), request('/api/hub?resource=public')]);
            setState({ slots: [...availability.slots.map(s => ({ ...s, is_booked: false })), ...(availability.booked_slots || [])].sort((a,b) => new Date(a.starts_at)-new Date(b.starts_at)), pricing: catalog.pricing, loading: false, error: '' });
        } catch (error) {
            setState(previous => ({ ...previous, loading: false, error: error.message }));
        }
    }
    React.useEffect(() => {
        const payment = new URLSearchParams(window.location.search).get('payment');
        if (payment === 'returned') sessionStorage.removeItem('ochilink-booking-token');
        refresh();
        const timer = setInterval(refresh, 15000);
        window.addEventListener('focus', refresh);
        return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
    }, []);
    return {
        ...state, busy, date, time,
        dates: [...new Set(state.slots.map(s => date(s.starts_at)))],
        label: id => { const slot = state.slots.find(s => s.id === id); return slot ? time(slot.starts_at) : '—'; },
        async book(values, slotId) {
            setBusy(true);
            try {
                if (!token.current) {
                    token.current = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
                    sessionStorage.setItem('ochilink-booking-token', token.current);
                }
                const result = await request('/api/consultations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: values.name, client_email: values.email, phone: values.phone, service: values.service, notes: values.notes, duration_minutes: Number(values.duration[0]) * 60, slot_id: slotId, booking: true, booking_token: token.current }) });
                const target = new URL(result.checkout_url);
                if (target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com') throw new Error('Unable to open secure checkout. Please try again.');
                window.location.assign(target.href);
                return result;
            } catch (error) { if (/finished or expired|unavailable or expired|no outstanding/.test(error.message)) { token.current = ''; sessionStorage.removeItem('ochilink-booking-token'); } await refresh(); if (token.current) throw new Error(error.message + ' Reload this page to resume your checkout.'); throw error; }
            finally { setBusy(false); }
        },
    };
};
