import { RawImage, load_image } from '@huggingface/transformers';

/** True when MIME or URL path indicates SVG (createImageBitmap cannot decode SVG). */
export function isSvgSource(input: string | Blob): boolean {
  if (typeof input !== 'string') {
    return (input.type || '').toLowerCase().includes('svg');
  }
  if (input.startsWith('data:image/svg')) return true;
  try {
    const base =
      typeof location !== 'undefined' ? location.href : 'http://localhost/';
    const u = new URL(input, base);
    return /\.svg($|\?|#)/i.test(u.pathname);
  } catch {
    return /\.svg($|\?|#)/i.test(input);
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (
      typeof location !== 'undefined' &&
      /^https?:/i.test(src) &&
      !src.startsWith(location.origin)
    ) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('Image decoded with zero dimensions'));
        return;
      }
      resolve(img);
    };
    img.onerror = () =>
      reject(
        new Error(
          `Failed to decode image (${src.slice(0, 96)}${src.length > 96 ? '…' : ''})`,
        ),
      );
    img.src = src;
  });
}

function drawToCanvas(
  img: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2D canvas context');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/**
 * Rasterize via HTMLImageElement → canvas → RawImage.
 * Works for SVG, data URLs, blob URLs, and raster formats.
 */
async function rasterizeViaHtmlImage(src: string): Promise<RawImage> {
  const img = await loadHtmlImage(src);
  const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
  return RawImage.fromCanvas(canvas);
}

function decodeError(err: unknown, hint: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/createImageBitmap|decode|InvalidStateError|EncodingError/i.test(msg)) {
    return new Error(
      `${hint}: ${msg}. SVG must be rasterized first; empty or corrupt blobs also fail.`,
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

/**
 * Load any image source into a RawImage suitable for the embedder.
 * Prefer HTMLImageElement+canvas for SVG; fall back to that path when
 * transformers.js createImageBitmap fails on other types too.
 */
export async function loadImageForEmbedding(
  input: string | Blob,
): Promise<RawImage> {
  try {
    if (typeof input === 'string') {
      if (isSvgSource(input)) {
        return await rasterizeViaHtmlImage(input);
      }
      try {
        return await load_image(input);
      } catch (err) {
        console.warn(
          '[image] load_image failed; falling back to HTMLImageElement path',
          err,
        );
        return await rasterizeViaHtmlImage(input);
      }
    }

    if (input.size === 0) {
      throw new Error('Empty image blob — nothing to decode');
    }

    if (isSvgSource(input)) {
      const url = URL.createObjectURL(input);
      try {
        return await rasterizeViaHtmlImage(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    try {
      return await load_image(input);
    } catch (err) {
      console.warn(
        '[image] createImageBitmap path failed; falling back to HTMLImageElement',
        err,
      );
      const url = URL.createObjectURL(input);
      try {
        return await rasterizeViaHtmlImage(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch (err) {
    throw decodeError(
      err,
      'Cannot decode image for embedding',
    );
  }
}
