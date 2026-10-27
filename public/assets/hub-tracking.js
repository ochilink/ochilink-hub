(function () {
    const CONSENT_KEY = 'ochi-analytics-consent';
    const MAX_STRING = 80;
    const ALLOWED_KEYS = new Set([
        'page_path',
        'section',
        'action',
        'item_type',
        'app_slug',
        'filter',
        'result',
        'step',
        'source',
    ]);
    const BLOCKED_KEY_PATTERN =
        /(email|name|phone|address|ssn|dob|birth|card|payment|amount|document|file|application_id|customer_id|token|signature)/i;

    let containerId = null;
    let loading = null;

    function hasConsent() {
        try {
            return localStorage.getItem(CONSENT_KEY) === 'yes';
        } catch {
            return false;
        }
    }

    function cleanValue(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'boolean') return value;
        if (typeof value !== 'string') return undefined;
        return value.trim().slice(0, MAX_STRING);
    }

    function safeData(data) {
        const output = {};
        for (const [key, value] of Object.entries(data || {})) {
            if (
                !ALLOWED_KEYS.has(key) ||
                BLOCKED_KEY_PATTERN.test(key)
            ) continue;
            const cleaned = cleanValue(value);
            if (cleaned !== undefined && cleaned !== '') output[key] = cleaned;
        }
        return output;
    }

    function dataLayer() {
        window.dataLayer = window.dataLayer || [];
        return window.dataLayer;
    }

    async function getContainerId() {
        if (containerId) return containerId;
        const response = await fetch('/api/hub?resource=tracking-config', {
            cache: 'no-store',
        });
        if (!response.ok) return null;
        const config = await response.json().catch(() => ({}));
        const value = String(config.container_id || '').trim();
        if (!/^GTM-[A-Z0-9]+$/i.test(value)) return null;
        containerId = value.toUpperCase();
        return containerId;
    }

    async function init() {
        if (!hasConsent()) return false;
        if (document.querySelector('script[data-ochilink-gtm]')) return true;
        if (loading) return loading;

        loading = (async () => {
            const id = await getContainerId();
            if (!id || !hasConsent()) return false;

            const layerName = 'dataLayer';
            const layer = dataLayer();
            layer.push({
                event: 'ochilink_consent_granted',
                analytics_storage: 'granted',
            });
            layer.push({
                'gtm.start': Date.now(),
                event: 'gtm.js',
            });

            // Use Google's standard GTM bootstrap semantics after consent.
            // Keeping the standard insertion pattern improves Tag Assistant
            // compatibility while preserving Ochilink's consent gate.
            const firstScript = document.getElementsByTagName('script')[0];
            const script = document.createElement('script');
            const layerParam = layerName !== 'dataLayer' ? '&l=' + layerName : '';
            script.async = true;
            script.src =
                'https://www.googletagmanager.com/gtm.js?id=' +
                encodeURIComponent(id) +
                layerParam;
            script.dataset.ochilinkGtm = id;
            if (firstScript?.parentNode) {
                firstScript.parentNode.insertBefore(script, firstScript);
            } else {
                document.head.appendChild(script);
            }
            return true;
        })().finally(() => {
            loading = null;
        });

        return loading;
    }

    function track(eventName, data = {}) {
        if (!hasConsent()) return false;
        const event = String(eventName || '').trim();
        if (!/^ochilink_[a-z0-9_]{1,60}$/.test(event)) return false;
        const payload = safeData(data);

        void init().then((ready) => {
            if (!ready || !hasConsent()) return;
            dataLayer().push({
                event,
                ...payload,
            });
        });
        return true;
    }

    function consentChanged(value) {
        if (value === 'yes') {
            void init();
            return;
        }
        if (window.dataLayer) {
            window.dataLayer.push({
                event: 'ochilink_consent_denied',
                analytics_storage: 'denied',
            });
        }
    }

    window.OchilinkTracking = Object.freeze({
        init,
        track,
        hasConsent,
        consentChanged,
    });

    if (hasConsent()) void init();
})();
