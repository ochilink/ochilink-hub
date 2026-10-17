import { createMediaUploadPanel } from './media-panel.js';

// The existing React dashboard controls access to this mount. The API also
// enforces administrator authorization; no media is uploaded in this phase.
const css = `
.ochi-media-panel{display:grid;gap:16px;color:var(--text)}
.ochi-media-panel h2{font-size:19px;font-weight:700}
.ochi-media-panel p{color:var(--text-muted);font-size:13px}
.ochi-media-label{font-size:12px;font-weight:650;color:var(--text)}
.ochi-media-select{width:100%;padding:12px 14px;border:1px solid var(--border-strong);border-radius:12px;background:var(--bg-elevated);color:var(--text)}
.ochi-media-drop{border:2px dashed var(--border-strong);border-radius:14px;padding:32px 18px;text-align:center;cursor:pointer;background:var(--bg);color:var(--text-muted);transition:border-color .15s}
.ochi-media-drop:hover,.ochi-media-drop:focus-visible{border-color:var(--lime);outline-offset:3px}
.ochi-media-panel button{border-radius:12px;padding:12px 18px;font-weight:700;background:var(--lime);color:#00332a;justify-self:start}
.ochi-media-panel button:disabled{opacity:.45;cursor:not-allowed}
`;
function mount() {
  const target = document.getElementById('ochi-media-mount');
  if (!target || target.dataset.mounted) return;
  target.dataset.mounted = 'true';
  if (!document.getElementById('ochi-media-style')) {
    const style = document.createElement('style');
    style.id = 'ochi-media-style';
    style.textContent = css;
    document.head.append(style);
  }
  const panel = createMediaUploadPanel({
    document,
    canUpload: () => Boolean(select.value),
    onUpload: async file => {
      if (!select.value) throw new Error('Select an application first.');
      const response = await fetch('/api/showcase-upload?app_id=' + encodeURIComponent(select.value), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': file.type, 'X-Media-Filename': file.name },
        body: file,
      });
      if (!response.ok) {
        let message = 'Upload failed (' + response.status + ').';
        try { const data = await response.json(); if (typeof data.error === 'string') message = data.error; } catch {}
        throw new Error(message);
      }
      const data = await response.json();
      if (data.ok !== true) throw new Error('Unexpected upload response.');
    },
  });
  const label = document.createElement('label');
  label.className = 'ochi-media-label';
  label.textContent = 'Select application';
  const select = document.createElement('select');
  select.className = 'ochi-media-select';
  select.setAttribute('aria-label', 'Select application for showcase');
  select.disabled = true;
  const option = document.createElement('option');
  option.textContent = 'Loading applications…';
  option.value = '';
  select.append(option);
  label.append(select);
  const note = document.createElement('p');
  note.textContent = 'Preview environment: upload only harmless standalone HTML or image test files.';
  note.className = 'mono text-xs';
  const button = panel.querySelector('button');
  button.disabled = true;
  const status = panel.querySelector('[role="status"]');
  const selectedApp = document.createElement('p');
  selectedApp.className = 'mono text-xs';
  selectedApp.setAttribute('role', 'status');
  selectedApp.textContent = 'Choose an application to associate with your showcase.';
  select.addEventListener('change', () => {
    const choice = select.selectedOptions[0];
    selectedApp.textContent = select.value
      ? 'Selected application: ' + choice.textContent
      : 'Choose an application to associate with your showcase.';
    panel.refreshUploadState();
  });
  panel.addEventListener('change', () => { panel.refreshUploadState(); });
  target.replaceChildren(note, label, selectedApp, panel);
  // The existing administrator API is the sole source of real app records.
  fetch('/api/hub?resource=admin', { credentials: 'same-origin' })
    .then(async response => {
      if (!response.ok) throw new Error('Application list unavailable.');
      return response.json();
    })
    .then(data => {
      select.replaceChildren();
      const apps = Array.isArray(data.apps) ? data.apps : [];
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = apps.length ? 'Choose an application' : 'No applications available';
      select.append(placeholder);
      for (const app of apps) {
        if (!app || typeof app.id !== 'string') continue;
        const item = document.createElement('option');
        item.value = app.id;
        item.textContent = String(app.title || app.name || 'Untitled application');
        select.append(item);
      }
      select.disabled = !apps.length;
      panel.refreshUploadState();
      if (!apps.length) status.textContent = 'No applications are available to select.';
      selectedApp.textContent = apps.length
        ? 'Choose an application to associate with your showcase.'
        : 'No applications are available to select.';
    })
    .catch(() => {
      select.replaceChildren();
      const failed = document.createElement('option');
      failed.textContent = 'Unable to load applications';
      select.append(failed);
      status.textContent = 'Application list could not be loaded. Please sign in again or retry.';
    });
}
const observer = new MutationObserver(mount);
observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
mount();
