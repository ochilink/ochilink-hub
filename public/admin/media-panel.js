// OCH-MEDIA-002: reusable media upload panel for the existing admin React UI.
// No storage credentials or HTML execution in the browser.
const ACCEPTED = new Map([
  ['text/html', '.html'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
]);
const MAX_BYTES = 5 * 1024 * 1024;

export function validateMediaSelection(file) {
  if (!file || typeof file.name !== 'string') return 'Choose a file.';
  const ext = ACCEPTED.get(file.type);
  if (!ext || !file.name.toLowerCase().endsWith(ext))
    return 'Choose an HTML, PNG, JPG, or WebP file.';
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_BYTES)
    return 'File must be between 1 byte and 5 MB.';
  return null;
}

export function createMediaUploadPanel({ document: doc = document, onUpload }) {
  if (typeof onUpload !== 'function') throw new TypeError('onUpload is required');
  const root = doc.createElement('section');
  root.className = 'ochi-media-panel';
  root.setAttribute('aria-label', 'Application media upload');
  const heading = doc.createElement('h2');
  heading.textContent = 'Application Media';
  const hint = doc.createElement('p');
  hint.textContent = 'Upload a standalone HTML showcase or an image (maximum 5 MB).';
  const drop = doc.createElement('div');
  drop.className = 'ochi-media-drop';
  drop.setAttribute('role', 'button');
  drop.setAttribute('tabindex', '0');
  drop.textContent = 'Drop an HTML or image file here, or click to browse';
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = '.html,.png,.jpg,.webp';
  input.setAttribute('aria-label', 'Select showcase file');
  input.hidden = true;
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  const upload = doc.createElement('button');
  upload.type = 'button';
  upload.textContent = 'Upload selected media';
  upload.disabled = true;
  let selected = null;
  function choose(file) {
    const error = validateMediaSelection(file);
    selected = error ? null : file;
    upload.disabled = Boolean(error);
    status.textContent = error || ('Selected: ' + file.name);
  }
  input.addEventListener('change', () => choose(input.files?.[0]));
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });
  drop.addEventListener('dragover', event => { event.preventDefault(); });
  drop.addEventListener('drop', event => {
    event.preventDefault();
    choose(event.dataTransfer?.files?.[0]);
  });
  upload.addEventListener('click', async () => {
    if (!selected) return;
    upload.disabled = true;
    status.textContent = 'Uploading…';
    try {
      await onUpload(selected);
      status.textContent = 'Upload completed.';
      selected = null;
      input.value = '';
    } catch {
      status.textContent = 'Upload failed. Please retry.';
      upload.disabled = false;
    }
  });
  root.append(heading, hint, drop, input, status, upload);
  return root;
}
