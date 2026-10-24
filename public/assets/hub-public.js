window.useOchilinkPublic = function useOchilinkPublic(React) {
    const [state, setState] = React.useState({
        apps: [],
        pricing: null,
        loading: true,
        error: '',
    });
    const [attempt, setAttempt] = React.useState(0);
    React.useEffect(() => {
        const controller = new AbortController();
        const loaderToken = window.OchilinkLoader?.start('Loading apps & services…', {
            subtext: 'Syncing live Ochilink data',
        });
        setState((previous) => ({ ...previous, loading: true, error: '' }));
        fetch('/api/hub?resource=public', {
            signal: controller.signal,
            cache: 'no-store',
        })
            .then(async (response) => {
                if (!response.ok)
                    throw new Error('Apps are temporarily unavailable.');
                return response.json();
            })
            .then((data) =>
                setState({
                    apps: data.apps.map((app) => ({
                        ...app,
                        desc: app.description,
                        tags: app.tech,
                        status: app.status === 'Live' ? 'live' : 'soon',
                        link: app.link || '#schedule',
                        cover: app.cover_image_url || '',
                        icon: app.name
                            .replace(/[^A-Za-z0-9]/g, '')
                            .slice(0, 2)
                            .toUpperCase(),
                        year: '',
                    })),
                    pricing: data.pricing,
                    loading: false,
                    error: '',
                }),
            )
            .catch((error) => {
                if (error.name !== 'AbortError')
                    setState({
                        apps: [],
                        pricing: null,
                        loading: false,
                        error: 'Apps are temporarily unavailable.',
                    });
            })
            .finally(() => window.OchilinkLoader?.stop(loaderToken));
        return () => {
            controller.abort();
            window.OchilinkLoader?.stop(loaderToken);
        };
    }, [attempt]);
    return { ...state, reload: () => setAttempt((value) => value + 1) };
};
window.OchilinkConsultation = function OchilinkConsultation({
    React,
    onClose,
}) {
    const h = React.createElement;
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [sent, setSent] = React.useState(false);
    const [slots, setSlots] = React.useState([]);
    React.useEffect(() => {
        const loaderToken = window.OchilinkLoader?.start('Loading availability…');
        fetch('/api/hub?resource=availability')
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((d) => setSlots(d.slots))
            .catch(() => setSlots([]))
            .finally(() => window.OchilinkLoader?.stop(loaderToken));
    }, []);
    const ref = React.useRef(null);
    React.useEffect(() => {
        const previous = document.activeElement;
        ref.current?.querySelector('input')?.focus();
        const keydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
            if (event.key !== 'Tab') return;
            const dialog = ref.current?.parentElement;
            const fields = [
                ...(dialog?.querySelectorAll('input,textarea,button,a[href]') ||
                    []),
            ].filter((el) => !el.disabled);
            const first = fields[0],
                last = fields[fields.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        };
        const dialog = ref.current?.parentElement;
        dialog?.setAttribute('role', 'dialog');
        dialog?.setAttribute('aria-modal', 'true');
        dialog?.setAttribute('aria-label', 'Request a consultation');
        document.addEventListener('keydown', keydown);
        return () => {
            document.removeEventListener('keydown', keydown);
            previous?.focus();
        };
    }, []);
    const inputStyle = {
        display: 'block',
        width: '100%',
        border: '1px solid #64748b',
        borderRadius: 10,
        padding: 10,
        marginTop: 6,
        background: 'transparent',
        color: 'inherit',
    };
    return h(
        'div',
        { ref },
        h(
            'p',
            { style: { margin: '16px 0', fontSize: 13 } },
            'This is a request. Your appointment is confirmed separately by email.',
        ),
        message &&
            h('p', { role: 'status', style: { margin: '12px 0' } }, message),
        !sent &&
            h(
                'form',
                {
                    onSubmit: async (event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        setBusy(true);
                        setMessage('');
                        const loaderToken = window.OchilinkLoader?.start(
                            'Sending consultation request…',
                            { subtext: 'Submitting your details securely' },
                        );
                        try {
                            const response = await fetch(
                                '/api/hub?resource=consultations',
                                {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify(
                                        Object.fromEntries(new FormData(form)),
                                    ),
                                },
                            );
                            const result = await response.json();
                            if (!response.ok)
                                throw new Error(
                                    result.error || 'Request failed.',
                                );
                            setSent(true);
                            setMessage(
                                'Request received. We’ll contact you by email to discuss availability.',
                            );
                        } catch (error) {
                            setMessage(
                                error.message ||
                                    'Unable to send your request. Please try again.',
                            );
                        } finally {
                            window.OchilinkLoader?.stop(loaderToken);
                            setBusy(false);
                        }
                    },
                },
                ...[
                    ['Your name', 'client_name', 'text', 160],
                    ['Email', 'client_email', 'email', 254],
                ].map(([label, name, type, maxLength]) =>
                    h(
                        'label',
                        {
                            key: name,
                            style: { display: 'block', margin: '12px 0' },
                        },
                        label,
                        h('input', {
                            name,
                            type,
                            maxLength,
                            required: true,
                            autoComplete: type === 'email' ? 'email' : 'name',
                            style: inputStyle,
                        }),
                    ),
                ),
                h(
                    'label',
                    null,
                    `Preferred appointment time (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
                    h(
                        'select',
                        { name: 'slot_id', style: inputStyle },
                        h(
                            'option',
                            { value: '' },
                            slots.length
                                ? 'No preferred time / discuss by email'
                                : 'Request a time by email',
                        ),
                        ...slots.map((slot) =>
                            h(
                                'option',
                                { key: slot.id, value: slot.id },
                                new Date(slot.starts_at).toLocaleString(),
                            ),
                        ),
                    ),
                ),
                h(
                    'label',
                    null,
                    'What would you like help with?',
                    h('textarea', {
                        name: 'notes',
                        maxLength: 3000,
                        rows: 3,
                        style: inputStyle,
                    }),
                ),
                h(
                    'button',
                    {
                        type: 'submit',
                        disabled: busy,
                        style: {
                            marginTop: 16,
                            padding: '10px 20px',
                            borderRadius: 24,
                            background: '#D6FF57',
                            color: '#101416',
                            fontWeight: 700,
                        },
                    },
                    busy ? 'Sending…' : 'Send request',
                ),
            ),
    );
};
window.HubVisitorTools = function HubVisitorTools({ React }) {
    const h = React.createElement;
    const [consent, setConsent] = React.useState(() =>
        localStorage.getItem('ochi-analytics-consent'),
    );
    const [payment, setPayment] = React.useState(null),
        [error, setError] = React.useState(''),
        [busy, setBusy] = React.useState(false);
    const token = (location.hash.match(/^#pay=([a-f0-9]{64})$/) || [])[1];
    React.useEffect(() => {
        if (!token) return;
        const loaderToken = window.OchilinkLoader?.start('Loading payment details…');
        fetch('/api/hub?resource=payment-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        })
            .then(async (r) => {
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                setPayment(d);
            })
            .catch((e) => setError(e.message))
            .finally(() => window.OchilinkLoader?.stop(loaderToken));
    }, []);
    React.useEffect(() => {
        if (
            consent !== 'yes' ||
            navigator.doNotTrack === '1' ||
            navigator.globalPrivacyControl ||
            token ||
            location.search.includes('payment=')
        )
            return;
        let session = sessionStorage.getItem('ochi-analytics-session');
        if (!session) {
            session = crypto.randomUUID();
            sessionStorage.setItem('ochi-analytics-session', session);
        }
        let stopped = false,
            lastClick = 0,
            depth = 0;
        const send = (body) => {
            if (!stopped)
                fetch('/api/hub?resource=analytics', {
                    method: 'POST',
                    keepalive: true,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...body,
                        consent: true,
                        session,
                        path: location.pathname,
                    }),
                }).catch(() => {});
        };
        send({ event_type: 'view' });
        const click = (e) => {
            if (
                Date.now() - lastClick < 1000 ||
                e.target.closest('input,textarea,select,[data-private],form')
            )
                return;
            lastClick = Date.now();
            const column = Math.min(
                    11,
                    Math.max(
                        0,
                        Math.floor((e.clientX / Math.max(1, innerWidth)) * 12),
                    ),
                ),
                row = Math.min(
                    7,
                    Math.max(
                        0,
                        Math.floor((e.clientY / Math.max(1, innerHeight)) * 8),
                    ),
                );
            send({
                event_type: 'click',
                cell: row * 12 + column,
                target: e.target.closest('a')
                    ? 'link'
                    : e.target.closest('button')
                      ? 'button'
                      : 'other',
            });
        };
        const scroll = () => {
            depth = Math.max(
                depth,
                Math.min(
                    100,
                    Math.round(
                        ((scrollY + innerHeight) /
                            Math.max(
                                innerHeight,
                                document.documentElement.scrollHeight,
                            )) *
                            100,
                    ),
                ),
            );
        };
        const flush = () => {
            scroll();
            send({ event_type: 'scroll', depth });
        };
        const visibility = () => {
            if (document.visibilityState === 'hidden') flush();
        };
        document.addEventListener('click', click);
        window.addEventListener('scroll', scroll, { passive: true });
        document.addEventListener('visibilitychange', visibility);
        const interval = setInterval(flush, 30000);
        return () => {
            stopped = true;
            clearInterval(interval);
            document.removeEventListener('click', click);
            window.removeEventListener('scroll', scroll);
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [consent]);
    const choose = (value) => {
        localStorage.setItem('ochi-analytics-consent', value);
        setConsent(value);
        if (value !== 'yes')
            sessionStorage.removeItem('ochi-analytics-session');
    };
    const box = {
        background: '#101725',
        color: '#fff',
        border: '1px solid #64748b',
        borderRadius: 16,
        padding: 18,
        maxWidth: 430,
        boxShadow: '0 12px 30px #0004',
    };
    const buttonStyle = {
        padding: '8px 13px',
        border: '1px solid #64748b',
        borderRadius: 20,
        marginRight: 8,
        marginTop: 10,
    };
    const returned = new URLSearchParams(location.search).get('payment');
    if (['returned', 'cancelled'].includes(returned))
        return h(
            'div',
            {
                style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 100,
                    background: '#000a',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 20,
                },
                role: 'dialog',
                'aria-modal': true,
                'aria-label': 'Checkout status',
                'data-private': true,
            },
            h(
                'div',
                { style: box },
                h('h2', null, 'Ochilink checkout'),
                h(
                    'p',
                    { role: 'status' },
                    returned === 'returned'
                        ? 'Checkout submitted. Your payment record and receipt are updated after Stripe confirms the result. Your appointment is confirmed separately.'
                        : 'Checkout was closed. Use the link in your email if you would like to return to checkout.',
                ),
                h(
                    'button',
                    {
                        style: buttonStyle,
                        onClick: () => {
                            history.replaceState(null, '', location.pathname);
                            location.reload();
                        },
                    },
                    'Continue to Ochilink',
                ),
            ),
        );
    if (token)
        return h(
            'div',
            {
                style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 100,
                    background: '#000a',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 20,
                },
                role: 'dialog',
                'aria-modal': true,
                'aria-label': 'Consultation payment',
                'data-private': true,
            },
            h(
                'div',
                { style: box },
                h('h2', null, 'Ochilink consultation payment'),
                error && h('p', { role: 'alert' }, error),
                payment
                    ? h(
                          'div',
                          null,
                          h(
                              'p',
                              null,
                              `${payment.currency} ${payment.amount == null ? 'Quote pending' : Number(payment.amount).toFixed(2)} · ${payment.payment_status}`,
                          ),
                          h(
                              'p',
                              null,
                              'Payment confirmation comes from Stripe, separately from appointment confirmation.',
                          ),
                          payment.payment_status === 'Unpaid' &&
                              payment.status !== 'Cancelled' &&
                              payment.configured &&
                              Number(payment.amount) > 0 &&
                              h(
                                  'button',
                                  {
                                      style: buttonStyle,
                                      disabled: busy,
                                      onClick: async () => {
                                          setBusy(true);
                                          const loaderToken = window.OchilinkLoader?.start(
                                              'Opening secure checkout…',
                                              { subtext: 'Connecting to Stripe' },
                                          );
                                          try {
                                              const r = await fetch(
                                                      '/api/hub?resource=checkout',
                                                      {
                                                          method: 'POST',
                                                          headers: {
                                                              'Content-Type':
                                                                  'application/json',
                                                          },
                                                          body: JSON.stringify({
                                                              token,
                                                          }),
                                                      },
                                                  ),
                                                  d = await r.json();
                                              if (!r.ok)
                                                  throw new Error(d.error);
                                              const url = new URL(d.url);
                                              if (
                                                  url.protocol !== 'https:' ||
                                                  url.hostname !==
                                                      'checkout.stripe.com'
                                              )
                                                  throw new Error(
                                                      'Unexpected payment destination.',
                                                  );
                                              location.assign(d.url);
                                          } catch (e) {
                                              setError(e.message);
                                              setBusy(false);
                                              window.OchilinkLoader?.stop(loaderToken);
                                          }
                                      },
                                  },
                                  busy
                                      ? 'Opening Stripe…'
                                      : 'Pay securely with Stripe',
                              ),
                      )
                    : h('p', null, 'Loading payment…'),
                h(
                    'button',
                    {
                        style: buttonStyle,
                        onClick: () => {
                            history.replaceState(null, '', location.pathname);
                            location.reload();
                        },
                    },
                    'Close',
                ),
            ),
        );
    return h(
        'div',
        {
            'data-private': true,
            style: {
                position: 'fixed',
                bottom: 12,
                left: 12,
                zIndex: 35,
                fontSize: 12,
            },
        },
        !consent
            ? h(
                  'div',
                  { style: box },
                  h(
                      'p',
                      null,
                      'Allow anonymous page, click and scroll analytics? No form contents or raw IP addresses are stored. Optional; you can change this anytime.',
                  ),
                  h(
                      'button',
                      { style: buttonStyle, onClick: () => choose('yes') },
                      'Allow analytics',
                  ),
                  h(
                      'button',
                      { style: buttonStyle, onClick: () => choose('no') },
                      'Decline',
                  ),
              )
            : h(
                  'button',
                  {
                      onClick: () => {
                          localStorage.removeItem('ochi-analytics-consent');
                          setConsent(null);
                      },
                      style: {
                          ...buttonStyle,
                          background: '#101725',
                          color: '#fff',
                      },
                  },
                  'Privacy choices',
              ),
    );
};
