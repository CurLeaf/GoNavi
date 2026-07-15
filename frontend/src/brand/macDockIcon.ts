/**
 * Load a pre-baked macOS Dock tile and return raw base64 PNG.
 * Dock tiles are full-bleed opaque squares; macOS applies the squircle mask.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load dock icon: ${src}`));
    img.src = src;
  });
}

function canvasToBase64Png(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL('image/png');
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/**
 * Ensure the image is an opaque 1024 square (defensive) and return base64 PNG
 * without data-URL prefix for SetApplicationBrandIcon.
 */
export async function composeMacOSDockIconBase64(src: string): Promise<string> {
  const img = await loadImage(src);
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2d context unavailable');
  }
  // Opaque soft-blue fallback under draw (matches pre-baked dock tiles)
  ctx.fillStyle = '#E8F4FF';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Cover the whole tile — do not letterbox into a nested card
  ctx.drawImage(img, 0, 0, size, size);
  return canvasToBase64Png(canvas);
}
