(function () {
  'use strict';
  window.OchilinkLiveSmokeControl = function OchilinkLiveSmokeControl(props) {
    const React = props.React;
    const [ack, setAck] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [checkoutUrl, setCheckoutUrl] = React.useState('');
    if (props.role !== 'admin') return null;
    const h = React.createElement;
    async function createCheckout() {
      if (!ack || busy) return;
      if (!window.confirm('Create a one-time LIVE Stripe Checkout for $1.00 USD? This is not a customer booking. You will not be charged unless you complete Stripe Checkout.')) return;
      setBusy(true);
      setMessage('');
      setCheckoutUrl('');
      try {
        const response = await fetch('/api/admin-live-smoke-test', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 404) throw new Error('Live verification is disabled on this deployment.');
          throw new Error(data.error || 'Unable to create verification checkout.');
        }
        const url = new URL(data.checkout_url);
        if (url.protocol !== 'https:' || !['checkout.stripe.com', 'payments.stripe.com'].includes(url.hostname)) {
          throw new Error('Unexpected Stripe Checkout destination.');
        }
        setCheckoutUrl(url.href);
        setMessage('Checkout is ready. Open Stripe to complete the optional $1 live verification.');
      } catch (error) {
        setMessage(error.message || 'Checkout unavailable.');
      } finally {
        setBusy(false);
      }
    }
    return h('section', {
      className: 'rounded-[16px] border p-5 space-y-3',
      style: { background: 'var(--bg-elevated)', borderColor: 'var(--border)' },
      'aria-label': 'Live payment verification',
    }, [
      h('h3', { key: 'heading', className: 'mono text-[11px] font-bold' }, 'LIVE PAYMENT VERIFICATION — INTERNAL ONLY'),
      h('p', { key: 'intro', className: 'mono text-[11px]' },
        'One-time $1.00 USD Stripe checkout to verify live payment processing. Not a consultation or customer booking. Disabled by default on the server.'),
      h('label', { key: 'ack', className: 'flex items-center gap-2 mono text-[11px]' }, [
        h('input', { key: 'checkbox', type: 'checkbox', checked: ack, disabled: busy, onChange: e => setAck(e.target.checked) }),
        'I understand this creates a live checkout and payment is optional.',
      ]),
      h('button', {
        key: 'button', type: 'button', disabled: !ack || busy, onClick: createCheckout,
        className: 'focus-ring h-10 px-4 rounded-[10px] border mono text-[11px] disabled:opacity-50',
        style: { background: 'var(--lime)', color: 'var(--lime-ink)', borderColor: 'var(--border)' },
      }, busy ? 'Preparing checkout…' : 'Prepare $1 live test checkout'),
      message && h('p', { key: 'message', role: 'status', className: 'mono text-[11px]' }, message),
      checkoutUrl && h('a', {
        key: 'checkout', href: checkoutUrl, target: '_blank', rel: 'noopener noreferrer',
        className: 'mono text-[11px] underline',
      }, 'Open secure Stripe Checkout ↗'),
    ]);
  };
})();
