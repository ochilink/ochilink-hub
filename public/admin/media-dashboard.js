import { createMediaUploadPanel } from './media-panel.js';

// Admin-only mount: the existing React app controls navigation and authentication.
// The panel is intentionally not connected to storage until app selection and API
// routing are tested. Never imply an upload succeeded in this development state.
function mount() {
  const target = document.getElementById('ochi-media-mount');
  if (!target || target.dataset.mounted) return;
  target.dataset.mounted = 'true';
  const panel = createMediaUploadPanel({
    document,
    onUpload: async () => {
      throw new Error('Media upload is not enabled yet.');
    },
  });
  const note = document.createElement('p');
  note.textContent = 'Media upload is being connected. Files are not sent yet.';
  note.className = 'mono text-xs mb-4';
  target.replaceChildren(note, panel);
}
const observer = new MutationObserver(mount);
observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
mount();
