/** Encode une capture data-URL en vignette WebP 480×600 (≤ 200 Ko). */

export const VIGNETTE_W = 480;
export const VIGNETTE_H = 600;
export const VIGNETTE_MAX_BYTES = 200 * 1024;

/**
 * Réduit une image (data-URL) en WebP base64 (sans préfixe data:).
 * Qualité 0,8 puis 0,6 si trop gros.
 */
export async function encodeFavoriVignette(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = VIGNETTE_W;
  canvas.height = VIGNETTE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible.');
  // Remplir et centrer / couvrir (cover) dans 4:5.
  const scale = Math.max(VIGNETTE_W / img.width, VIGNETTE_H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (VIGNETTE_W - dw) / 2;
  const dy = (VIGNETTE_H - dh) / 2;
  ctx.fillStyle = '#ecebe8';
  ctx.fillRect(0, 0, VIGNETTE_W, VIGNETTE_H);
  ctx.drawImage(img, dx, dy, dw, dh);

  let blob = await canvasToBlob(canvas, 0.8);
  if (!blob || blob.size < 32) {
    // Repli si WebP non supporté (rare) : qualité PNG puis… non, on exige WebP.
    throw new Error('Encodage WebP de la vignette a échoué.');
  }
  if (blob.size > VIGNETTE_MAX_BYTES) blob = await canvasToBlob(canvas, 0.6);
  if (!blob || blob.size < 32) throw new Error('Encodage WebP de la vignette a échoué.');
  if (blob.size > VIGNETTE_MAX_BYTES) {
    throw new Error('Vignette trop grosse même en qualité réduite.');
  }
  const buf = await blob.arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Impossible de charger la capture.'));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Encodage WebP impossible.'))),
      'image/webp',
      quality,
    );
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
