(function () {
  'use strict';

  const state = {
    tokens: new Map(),
    visibleTimer: null,
    node: null,
    counter: 0,
  };

  function ensureNode() {
    if (state.node) return state.node;
    const root = document.createElement('div');
    root.id = 'ochi-global-loader';
    root.setAttribute('data-visible', 'false');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-busy', 'false');
    root.innerHTML =
      '<div class="ochi-loader-card">' +
      '<span class="ochi-spinner" aria-hidden="true"></span>' +
      '<div class="ochi-loader-label">Loading Ochilink…</div>' +
      '<div class="ochi-loader-subtext">Please wait</div>' +
      '</div>';
    document.body.appendChild(root);
    state.node = root;
    return root;
  }

  function render() {
    const root = ensureNode();
    const active = [...state.tokens.values()];
    if (!active.length) {
      clearTimeout(state.visibleTimer);
      state.visibleTimer = null;
      root.setAttribute('data-visible', 'false');
      root.setAttribute('aria-busy', 'false');
      return;
    }
    const current = active[active.length - 1];
    root.querySelector('.ochi-loader-label').textContent = current.label;
    root.querySelector('.ochi-loader-subtext').textContent =
      current.subtext || 'Please wait';
    root.setAttribute('aria-busy', 'true');
    if (root.getAttribute('data-visible') === 'true' || state.visibleTimer)
      return;
    state.visibleTimer = setTimeout(() => {
      state.visibleTimer = null;
      if (state.tokens.size)
        root.setAttribute('data-visible', 'true');
    }, current.delay ?? 140);
  }

  function start(label = 'Loading Ochilink…', options = {}) {
    const token = 'ochi-loader-' + (++state.counter);
    state.tokens.set(token, {
      label,
      subtext: options.subtext || '',
      delay: Number.isFinite(options.delay) ? options.delay : 140,
    });
    render();
    return token;
  }

  function stop(token) {
    if (token) state.tokens.delete(token);
    else state.tokens.clear();
    render();
  }

  async function track(promise, label, options) {
    const token = start(label, options);
    try {
      return await promise;
    } finally {
      stop(token);
    }
  }

  function inline(active, label = 'Loading…') {
    return active
      ? '<span class="ochi-inline-spinner" aria-hidden="true"></span>' + label
      : label;
  }

  window.OchilinkLoader = { start, stop, track, inline };

  const boot = () => {
    const token = start('Loading Ochilink…', {
      subtext: 'Preparing your workspace',
      delay: 80,
    });
    if (document.readyState === 'complete') {
      setTimeout(() => stop(token), 120);
    } else {
      window.addEventListener(
        'load',
        () => setTimeout(() => stop(token), 120),
        { once: true },
      );
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
