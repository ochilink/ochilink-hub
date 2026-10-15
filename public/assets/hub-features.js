/* Additional behaviors use the original page's style tokens and components. */
window.HubFeatureUI = function HubFeatureUI({
    React,
    section,
    api,
    notify,
    refresh,
}) {
    const h = React.createElement;
    const [data, setData] = React.useState(null),
        [busy, setBusy] = React.useState(false),
        [message, setMessage] = React.useState('');
    const [secret, setSecret] = React.useState(null),
        [codes, setCodes] = React.useState(null),
        [editor, setEditor] = React.useState(null);
    const panelStyle = {
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border)',
    };
    const fieldStyle = {
        background: 'var(--bg)',
        borderColor: 'var(--border)',
        color: 'var(--text)',
    };
    const inputClass =
        'focus-ring mt-1 w-full h-10 rounded-[10px] border px-3 mono text-[13px]';
    const button = (label, onClick, extra = {}) =>
        h(
            'button',
            {
                type: 'button',
                disabled: busy,
                onClick,
                className:
                    'focus-ring h-9 px-3 rounded-[10px] border mono text-[11px]',
                style: {
                    borderColor: 'var(--border)',
                    background: 'var(--text)',
                    color: 'var(--bg)',
                },
                ...extra,
            },
            label,
        );
    const input = (label, name, options = {}) =>
        h(
            'label',
            { className: 'block mono text-[11px]' },
            label,
            h('input', {
                name,
                className: inputClass,
                style: fieldStyle,
                ...options,
            }),
        );
    const card = (title, children) =>
        h(
            'section',
            {
                className: 'rounded-[16px] border p-5 space-y-4',
                style: panelStyle,
            },
            h('h2', { className: 'mono text-[11px] font-bold' }, title),
            children,
        );
    const load = async () => {
        if (section === 'settings') {
            const [mfa, emails] = await Promise.all([
                api('mfa'),
                api('email-outbox'),
            ]);
            setData({ mfa, emails });
        } else {
            const [admin, availability] = await Promise.all([
                api('admin'),
                api('availability-admin'),
            ]);
            setData({
                consultations: admin.consultations,
                slots: availability.slots,
            });
        }
    };
    React.useEffect(() => {
        load().catch((error) => setMessage(error.message));
        if (section === 'settings') return;
        const timer = setInterval(() => load().catch((error) => setMessage(error.message)), 15000);
        return () => clearInterval(timer);
    }, [section]);
    async function run(fn) {
        setBusy(true);
        setMessage('');
        try {
            await fn();
        } catch (error) {
            setMessage(error.message);
        } finally {
            setBusy(false);
        }
    }
    const status =
        message &&
        h('p', { role: 'status', className: 'mono text-[12px]' }, message);
    if (!data) return card('Loading', status || 'Loading settings…');
    if (section === 'settings')
        return h(
            'div',
            { className: 'grid lg:grid-cols-2 gap-6 mt-4' },
            card(
                'AUTHENTICATOR MFA',
                h(
                    'div',
                    { className: 'space-y-3' },
                    status,
                    h(
                        'p',
                        { className: 'mono text-[11px]' },
                        data.mfa.enabled
                            ? `Enabled · ${data.mfa.recovery_codes_remaining} recovery codes remaining`
                            : data.mfa.configured
                              ? 'Protect your account with a six-digit authenticator code.'
                              : 'Add APP_ENCRYPTION_KEY in Vercel to enable setup.',
                    ),
                    codes
                        ? h(
                              'div',
                              null,
                              h(
                                  'p',
                                  null,
                                  'Save these recovery codes privately. Each works once.',
                              ),
                              h(
                                  'pre',
                                  {
                                      className:
                                          'mono text-[12px] p-3 rounded-[10px]',
                                      style: fieldStyle,
                                  },
                                  codes.join('\n'),
                              ),
                              button('I saved my recovery codes', () =>
                                  setCodes(null),
                              ),
                          )
                        : h(
                              'form',
                              {
                                  onSubmit: (e) => {
                                      e.preventDefault();
                                      const form = Object.fromEntries(
                                          new FormData(e.currentTarget),
                                      );
                                      run(async () => {
                                          const action = data.mfa.enabled
                                              ? 'disable'
                                              : secret
                                                ? 'enable'
                                                : 'setup';
                                          const result = await api(
                                              'mfa',
                                              'POST',
                                              { ...form, action },
                                          );
                                          if (action === 'setup')
                                              setSecret(result);
                                          if (action === 'enable') {
                                              setCodes(result.recovery_codes);
                                              setSecret(null);
                                              await load();
                                              setMessage(
                                                  'MFA enabled. Save your recovery codes.',
                                              );
                                          }
                                          if (action === 'disable') {
                                              await load();
                                              setMessage('MFA disabled.');
                                          }
                                          e.target.reset();
                                      });
                                  },
                              },
                              input('Current password', 'password', {
                                  type: 'password',
                                  autoComplete: 'current-password',
                                  required: true,
                              }),
                              secret &&
                                  h(
                                      'div',
                                      { className: 'space-y-2 mt-3' },
                                      h(
                                          'p',
                                          { className: 'mono text-[11px]' },
                                          'In your authenticator app, add a time-based account using this secret:',
                                      ),
                                      h(
                                          'code',
                                          {
                                              style: {
                                                  display: 'block',
                                                  overflowWrap: 'anywhere',
                                                  marginBottom: '12px',
                                              },
                                          },
                                          secret.secret,
                                      ),
                                      h(
                                          'a',
                                          {
                                              href: secret.uri,
                                              style: {
                                                  display: 'block',
                                                  marginTop: '12px',
                                              },
                                              className:
                                                  'block underline mono text-[11px]',
                                          },
                                          'Open authenticator app',
                                      ),
                                  ),
                              (secret || data.mfa.enabled) &&
                                  input(
                                      'Authenticator or recovery code',
                                      'code',
                                      {
                                          required: true,
                                          autoComplete: 'one-time-code',
                                      },
                                  ),
                              h(
                                  'button',
                                  {
                                      type: 'submit',
                                      disabled: busy || !data.mfa.configured,
                                      className:
                                          'focus-ring mt-3 h-9 px-3 rounded-[10px] border mono text-[11px]',
                                      style: fieldStyle,
                                  },
                                  data.mfa.enabled
                                      ? 'Disable MFA'
                                      : secret
                                        ? 'Confirm and enable MFA'
                                        : 'Set up MFA',
                              ),
                          ),
                ),
            ),
            card(
                'AUTOMATED EMAILS',
                h(
                    'div',
                    { className: 'space-y-3' },
                    h(
                        'p',
                        { className: 'mono text-[11px]' },
                        data.emails.configured
                            ? 'Resend credentials configured. Check message status below; pending messages retry with maintenance.'
                            : 'Configure RESEND_API_KEY, MAIL_FROM, PUBLIC_SITE_URL and APP_ENCRYPTION_KEY.',
                    ),
                    button('Send pending emails', () =>
                        run(async () => {
                            const result = await api(
                                'email-outbox',
                                'POST',
                                {},
                            );
                            await load();
                            setMessage(`Sent ${result.sent} messages.`);
                        }),
                    ),
                    ...data.emails.emails.map((mail) =>
                        h(
                            'div',
                            {
                                key: mail.id,
                                className:
                                    'border rounded-[10px] p-3 mono text-[11px]',
                                style: panelStyle,
                            },
                            `${mail.kind} · ${mail.state} · attempts ${mail.attempts}`,
                            mail.last_error && h('p', null, mail.last_error),
                            mail.state === 'failed' &&
                                button('Retry', () =>
                                    run(async () => {
                                        await api('email-outbox', 'POST', {
                                            action: 'retry',
                                            id: mail.id,
                                        });
                                        await load();
                                    }),
                                ),
                        ),
                    ),
                    !data.emails.emails.length &&
                        h(
                            'p',
                            { className: 'mono text-[11px]' },
                            'No emails queued yet.',
                        ),
                ),
            ),
        );
    const localTime = (value) => {
        const date = new Date(value);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
    };
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return h(
        'div',
        { className: 'space-y-4 mt-4' },
        status,
        button('Copy public booking link', () => run(async () => {
            await navigator.clipboard.writeText(location.origin + '/booking');
            setMessage('Public booking link copied.');
        })),
        card(
            'AVAILABILITY',
            h(
                'div',
                { className: 'space-y-3' },
                h(
                    'p',
                    { className: 'mono text-[11px]' },
                    `Times are entered in ${timezone}. All reservations are stored in UTC.`,
                ),
                h(
                    'form',
                    {
                        className: 'grid grid-cols-2 gap-3',
                        onSubmit: (e) => {
                            e.preventDefault();
                            const form = e.currentTarget,
                                values = new FormData(form);
                            run(async () => {
                                await api('availability-admin', 'POST', {
                                    starts_at: new Date(
                                        values.get('starts'),
                                    ).toISOString(),
                                    ends_at: new Date(
                                        values.get('ends'),
                                    ).toISOString(),
                                });
                                form.reset();
                                await load();
                                setMessage('Availability added.');
                            });
                        },
                    },
                    input('Start', 'starts', {
                        type: 'datetime-local',
                        required: true,
                    }),
                    input('End', 'ends', {
                        type: 'datetime-local',
                        required: true,
                    }),
                    h(
                        'button',
                        {
                            type: 'submit',
                            disabled: busy,
                            className:
                                'focus-ring h-9 px-3 rounded-[10px] border mono text-[11px]',
                            style: fieldStyle,
                        },
                        'Add availability',
                    ),
                ),
                ...data.slots
                    .filter((s) => s.is_enabled)
                    .map((slot) =>
                        h(
                            'div',
                            {
                                key: slot.id,
                                className:
                                    'flex flex-wrap gap-3 items-center mono text-[11px]',
                            },
                            `${new Date(slot.starts_at).toLocaleString()} – ${new Date(slot.ends_at).toLocaleTimeString()} · ${slot.reserved_by ? "Reserved by " + slot.reserved_by : "Available"}`,
                            button('Remove', () =>
                                run(async () => {
                                    await api('availability-admin', 'DELETE', {
                                        id: slot.id,
                                    });
                                    await load();
                                    setMessage('Slot removed.');
                                }),
                            ),
                        ),
                    ),
                !data.slots.some((s) => s.is_enabled) &&
                    h(
                        'p',
                        { className: 'mono text-[11px]' },
                        'No availability published.',
                    ),
            ),
        ),
        card(
            'EDIT / SCHEDULE CONSULTATION',
            h(
                'div',
                { className: 'space-y-3' },
                h(
                    'select',
                    {
                        'aria-label': 'Choose consultation',
                        className: inputClass,
                        style: fieldStyle,
                        value: editor?.id || '',
                        onChange: (e) =>
                            setEditor(
                                data.consultations.find(
                                    (c) => c.id === e.target.value,
                                ) || null,
                            ),
                    },
                    h('option', { value: '' }, 'Choose a consultation'),
                    ...data.consultations.map((row) =>
                        h(
                            'option',
                            { key: row.id, value: row.id },
                            `${row.client_name} · ${row.status}`,
                        ),
                    ),
                ),
                editor &&
                    h(
                        'form',
                        {
                            key: editor.id,
                            className: 'space-y-3',
                            onSubmit: (e) => {
                                e.preventDefault();
                                const values = Object.fromEntries(
                                    new FormData(e.currentTarget),
                                );
                                run(async () => {
                                    await api('consultation-admin', 'PUT', {
                                        ...values,
                                        id: editor.id,
                                        amount:
                                            values.amount === ''
                                                ? null
                                                : Number(values.amount),
                                        slot_id: values.slot_id || null,
                                    });
                                    setEditor(null);
                                    await load();
                                    await refresh();
                                    setMessage(
                                        'Consultation updated. Notification queued.',
                                    );
                                });
                            },
                        },
                        input('Client name', 'client_name', {
                            defaultValue: editor.client_name,
                            required: true,
                            maxLength: 160,
                        }),
                        input('Email', 'client_email', {
                            type: 'email',
                            defaultValue: editor.client_email,
                            required: true,
                            maxLength: 254,
                        }),
                        input('Quoted amount (USD)', 'amount', {
                            type: 'number',
                            min: 0,
                            max: 100000,
                            step: '.01',
                            defaultValue: editor.amount ?? '',
                        }),
                        h(
                            'label',
                            { className: 'mono text-[11px]' },
                            'Status',
                            h(
                                'select',
                                {
                                    name: 'status',
                                    defaultValue: editor.status,
                                    className: inputClass,
                                    style: fieldStyle,
                                },
                                ...[
                                    'Requested',
                                    'Scheduled',
                                    'Completed',
                                    'Cancelled',
                                ].map((status) =>
                                    h('option', { key: status }, status),
                                ),
                            ),
                        ),
                        h(
                            'label',
                            { className: 'mono text-[11px]' },
                            'Appointment slot',
                            h(
                                'select',
                                {
                                    name: 'slot_id',
                                    defaultValue: editor.slot_id || '',
                                    className: inputClass,
                                    style: fieldStyle,
                                },
                                h('option', { value: '' }, 'No slot selected'),
                                ...data.slots
                                    .filter((s) => s.is_enabled)
                                    .map((slot) =>
                                        h(
                                            'option',
                                            { key: slot.id, value: slot.id },
                                            new Date(
                                                slot.starts_at,
                                            ).toLocaleString(),
                                        ),
                                    ),
                            ),
                        ),
                        h(
                            'label',
                            { className: 'mono text-[11px]' },
                            'Notes',
                            h('textarea', {
                                name: 'notes',
                                defaultValue: editor.notes,
                                maxLength: 3000,
                                rows: 3,
                                className: inputClass,
                                style: { ...fieldStyle, height: 'auto' },
                            }),
                        ),
                        h(
                            'button',
                            {
                                type: 'submit',
                                disabled: busy,
                                className:
                                    'focus-ring h-9 px-3 rounded-[10px] border mono text-[11px]',
                                style: fieldStyle,
                            },
                            'Save consultation',
                        ),
                        button('Email payment link', () =>
                            run(async () => {
                                await api('payment-link', 'POST', {
                                    id: editor.id,
                                });
                                await load();
                                setMessage('Payment link queued for delivery.');
                            }),
                        ),
                    ),
            ),
        ),
    );
};
window.HubRecovery = function HubRecovery({ React, api, onClose }) {
    const h = React.createElement,
        [message, setMessage] = React.useState(''),
        [busy, setBusy] = React.useState(false);
    const token = (location.hash.match(/^#reset=([a-f0-9]{64})$/) || [])[1];
    const style = {
        background: 'var(--bg)',
        color: 'var(--text)',
        borderColor: 'var(--border)',
    };
    return h(
        'div',
        {
            className: 'space-y-3 mt-4',
            role: 'region',
            'aria-label': token ? 'Reset password' : 'Password recovery',
        },
        h(
            'h3',
            { className: 'mono text-[12px] font-bold' },
            token ? 'Choose a new password' : 'Reset your password',
        ),
        message &&
            h('p', { role: 'status', className: 'mono text-[11px]' }, message),
        h(
            'form',
            {
                onSubmit: async (e) => {
                    e.preventDefault();
                    const values = Object.fromEntries(
                        new FormData(e.currentTarget),
                    );
                    setBusy(true);
                    try {
                        await api(
                            token ? 'reset-password' : 'recovery',
                            'POST',
                            token
                                ? { token, password: values.password }
                                : values,
                        );
                        setMessage(
                            token
                                ? 'Password updated. Sign in with your new password. MFA still applies if enabled.'
                                : 'If this account exists, a reset email has been queued.',
                        );
                        if (token)
                            history.replaceState(null, '', location.pathname);
                    } catch (error) {
                        setMessage(error.message);
                    } finally {
                        setBusy(false);
                    }
                },
            },
            h('input', {
                name: token ? 'password' : 'email',
                type: token ? 'password' : 'email',
                required: true,
                minLength: token ? 14 : undefined,
                autoComplete: token ? 'new-password' : 'email',
                placeholder: token ? 'New password (14+ characters)' : 'Email',
                className:
                    'focus-ring w-full h-10 rounded-[10px] border px-3 mono text-[13px]',
                style,
            }),
            h(
                'button',
                {
                    type: 'submit',
                    disabled: busy,
                    className:
                        'focus-ring mt-3 h-9 px-3 rounded-[10px] border mono text-[11px]',
                    style,
                },
                busy
                    ? 'Working…'
                    : token
                      ? 'Update password'
                      : 'Send reset link',
            ),
        ),
        h(
            'button',
            {
                type: 'button',
                onClick: onClose,
                className: 'underline mono text-[11px]',
            },
            'Back to sign in',
        ),
    );
};
