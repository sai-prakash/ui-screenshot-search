/** Upload policy, shared by validation and decoded-image resizing. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 2048;

export function validateUpload(blob: Pick<Blob, 'size'>): void {
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('image-too-large');
  if (blob.size === 0) throw new Error('empty-image');
}

export function embeddingDimensions(width: number, height: number): { width: number; height: number } {
  if (width <= 0 || height <= 0 || !Number.isFinite(width + height)) throw new Error('Invalid image dimensions');
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
