(function () {
  'use strict';

  const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
  const MAX_DATA_URL_LENGTH = 150000;

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Unable to read that image.'));
      };
      image.src = url;
    });
  }

  function renderCover(image, width, height, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;

    if (sourceRatio > targetRatio) {
      sw = Math.round(image.naturalHeight * targetRatio);
      sx = Math.round((image.naturalWidth - sw) / 2);
    } else {
      sh = Math.round(image.naturalWidth / targetRatio);
      sy = Math.round((image.naturalHeight - sh) / 2);
    }

    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  async function processFile(file) {
    if (!file) throw new Error('Choose an image first.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('Use a JPG, PNG, or WebP image.');
    if (file.size > MAX_SOURCE_BYTES)
      throw new Error('Use an image smaller than 8 MB.');

    const image = await loadImage(file);
    const attempts = [
      [640, 360, 0.68],
      [560, 315, 0.62],
      [480, 270, 0.58],
      [400, 225, 0.54],
    ];

    for (const [width, height, quality] of attempts) {
      const result = renderCover(image, width, height, quality);
      if (result.length <= MAX_DATA_URL_LENGTH) return result;
    }

    throw new Error('That image could not be compressed enough. Try a simpler screenshot.');
  }

  window.OchilinkCoverUploader = { processFile };
})();
