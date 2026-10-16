/* Data and actions only. The original page owns its layout and styling. */
window.useOriginalOchilinkAdmin = function useOriginalOchilinkAdmin(React) {
    const [user, setUser] = React.useState(null);
    const [data, setData] = React.useState({
        apps: [],
        users: [],
        logs: [],
        errors: [],
        consultations: [],
        activity: [],
        totals: {},
    });
    const [notice, setNotice] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [pricing, setPricing] = React.useState({ hourly: 0, min: 0 });
    const [expiresAt, setExpiresAt] = React.useState(null);
    const [now, setNow] = React.useState(Date.now());
    const [checking, setChecking] = React.useState(true);
    const [mfaRequired, setMfaRequired] = React.useState(false);
    const notify = (message) => setNotice(message);
    React.useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), 6500);
        return () => clearTimeout(timer);
    }, [notice]);
    async function api(resource, method = 'GET', body) {
        const response = await fetch('/api/hub?resource=' + resource, {
            method,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error('Unexpected server response. Please try again.');
        }
        if (!response.ok) {
            if (response.status === 401 && resource !== 'login') {
                setUser(null);
                setData({
                    apps: [],
                    users: [],
                    logs: [],
                    errors: [],
                    consultations: [],
                    activity: [],
                    totals: {},
                });
            }
            throw new Error(result.error || 'Request failed.');
        }
        return result;
    }
    async function refresh() {
        const [result, analytics] = await Promise.all([
            api('admin'),
            api('analytics-admin'),
        ]);
        setData({ ...result, analytics });
        setPricing((previous) =>
            previous.dirty
                ? previous
                : {
                      hourly: result.pricing?.hourly ?? 0,
                      min: result.pricing?.minimum ?? 0,
                  },
        );
    }
    React.useEffect(() => {
        let active = true;
        api('session')
            .then((result) => {
                if (!active) return;
                setUser(result.user);
                setExpiresAt(
                    result.user?.expires_at
                        ? new Date(result.user.expires_at).getTime()
                        : null,
                );
            })
            .catch((error) => {
                if (active) setError(error.message);
            })
            .finally(() => {
                if (active) setChecking(false);
            });
        return () => {
            active = false;
        };
    }, []);
    React.useEffect(() => {
        if (!user) return;
        refresh().catch((error) => notify(error.message));
        const interval = setInterval(
            () => refresh().catch((error) => notify(error.message)),
            15000,
        );
        return () => clearInterval(interval);
    }, [user?.id]);
    React.useEffect(() => {
        if (!user || !expiresAt) return;
        const timer = setInterval(() => {
            const current = Date.now();
            setNow(current);
            if (current >= expiresAt) {
                setUser(null);
                notify('Session expired. Please sign in again.');
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [user?.id, expiresAt]);
    async function login(email, password, otp) {
        setBusy(true);
        setError(null);
        try {
            const result = await api('login', 'POST', { email, password, otp });
            if (result.mfa_required) {
                setMfaRequired(true);
                return;
            }
            setMfaRequired(false);
            setUser(result.user);
            setExpiresAt(Date.now() + 900000);
            setNow(Date.now());
            notify('Welcome back.');
        } catch (error) {
            setError(error.message);
        } finally {
            setBusy(false);
        }
    }
    async function action(resource, method, body, message) {
        setBusy(true);
        try {
            await api(resource, method, body);
            await refresh();
            if (message) notify(message);
            return true;
        } catch (error) {
            notify(error.message);
            return false;
        } finally {
            setBusy(false);
        }
    }
    async function logout() {
        setBusy(true);
        try {
            await api('logout', 'POST', {});
            setUser(null);
            notify('Logged out.');
        } catch (error) {
            notify(error.message);
        } finally {
            setBusy(false);
        }
    }
    const apps = data.apps.map((app) => ({
        ...app,
        desc: app.description,
        link: app.link || '',
    }));
    const users = data.users.map((row) => ({
        ...row,
        failedAttempts: row.failed_attempts,
        lockedUntil: row.locked_until,
        createdAt: row.created_at?.slice(0, 10),
    }));
    const logs = data.logs.map((row) => ({
        id: row.log_id,
        ts: new Date(row.timestamp).getTime(),
        type: row.event_type,
        user:
            data.users.find((u) => u.id === row.actor_id)?.email ||
            'Anonymous / unavailable',
        ip: '—',
        ua: '—',
        reason:
            row.failure_reason ||
            (Object.keys(row.metadata || {}).length
                ? JSON.stringify(row.metadata)
                : '—'),
    }));
    const errors = data.errors.map((row) => ({
        ...row,
        ts: new Date(row.created_at).getTime(),
        stack: 'No stack trace recorded.',
    }));
    const consultations = data.consultations.map((row) => ({
        ...row,
        client: row.client_name + ' · ' + row.client_email,
        date: row.scheduled_at
            ? new Date(row.scheduled_at).toLocaleString()
            : 'Not scheduled',
        duration: row.duration_minutes / 60,
        amount: row.amount == null ? null : Number(row.amount),
    }));
    return {
        api,
        mfaRequired,
        analytics: data.analytics || { clicks: [], scroll: [], pages: [] },
        user,
        apps,
        users,
        logs,
        errors,
        consultations,
        activity: data.activity || [],
        totals: data.totals || {},
        notice,
        notify,
        error,
        busy,
        checking,
        login,
        logout,
        refresh,
        action,
        pricing,
        setPricing: (update) =>
            setPricing((previous) => ({
                ...(typeof update === 'function' ? update(previous) : update),
                dirty: true,
            })),
        savePricing: async () => {
            const saved = await action(
                'pricing',
                'PUT',
                { hourly: pricing.hourly, minimum: pricing.min },
                'Pricing saved.',
            );
            if (saved)
                setPricing((previous) => ({ ...previous, dirty: false }));
        },
        sessionSeconds: expiresAt
            ? Math.max(0, Math.ceil((expiresAt - now) / 1000))
            : 900,
        appPayload: (app) => ({
            id: app.id,
            name: app.name,
            slug: app.slug,
            description: app.desc || '',
            link: app.link || null,
            tech: (app.tech || []).filter(Boolean),
            status: app.status || 'Coming Soon',
            is_published: app.is_published ?? false,
            sort_order: app.sort_order ?? 0,
        }),
    };
};
