const DOCK_ICON_SIZE = 1024;
const DOCK_ICON_INSET = 24;
const DOCK_ICON_CORNER_RADIUS = 216;

export type DockIconRuntimeEnvironment = {
  platform?: unknown;
  buildType?: unknown;
};

/**
 * Only the native macOS runtime can update the Dock image.  The generated
 * Wails bridge also exists in the browser build, so checking method presence
 * alone would still serialize and post a large image from the web client.
 */
export function shouldSyncMacOSDockIcon(environment?: DockIconRuntimeEnvironment | null): boolean {
  return String(environment?.platform || '').trim().toLowerCase() === 'darwin'
    && String(environment?.buildType || '').trim().toLowerCase() !== 'web';
}

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

function addRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + clampedRadius, y);
  ctx.lineTo(x + width - clampedRadius, y);
  ctx.arcTo(x + width, y, x + width, y + clampedRadius, clampedRadius);
  ctx.lineTo(x + width, y + height - clampedRadius);
  ctx.arcTo(x + width, y + height, x + width - clampedRadius, y + height, clampedRadius);
  ctx.lineTo(x + clampedRadius, y + height);
  ctx.arcTo(x, y + height, x, y + height - clampedRadius, clampedRadius);
  ctx.lineTo(x, y + clampedRadius);
  ctx.arcTo(x, y, x + clampedRadius, y, clampedRadius);
  ctx.closePath();
}

/**
 * Compose the selected opaque brand tile into a rounded, transparent PNG.
 * The transparent outer pixels let macOS apply its native Dock treatment
 * instead of displaying the source image as a full square.
 */
export async function composeMacOSDockIconBase64(src: string): Promise<string> {
  const img = await loadImage(src);
  const size = DOCK_ICON_SIZE;
  const tileSize = size - (DOCK_ICON_INSET * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2d context unavailable');
  }
  ctx.save();
  addRoundedRectPath(ctx, DOCK_ICON_INSET, DOCK_ICON_INSET, tileSize, tileSize, DOCK_ICON_CORNER_RADIUS);
  ctx.clip();
  // Opaque soft-blue fallback under draw (matches the pre-baked dock tiles).
  ctx.fillStyle = '#E8F4FF';
  ctx.fillRect(DOCK_ICON_INSET, DOCK_ICON_INSET, tileSize, tileSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, DOCK_ICON_INSET, DOCK_ICON_INSET, tileSize, tileSize);
  ctx.restore();
  return canvasToBase64Png(canvas);
}
