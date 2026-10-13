export type PackedVector = { s: number; b: string };

/** Decode an int8 base64 vector (per-vector scale) written by scripts/embed-system.mjs. */
export function unpackInt8(p: PackedVector): Float32Array {
  const bin = typeof atob === 'function' ? atob(p.b) : Buffer.from(p.b, 'base64').toString('binary');
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    const byte = bin.charCodeAt(i);
    out[i] = (byte > 127 ? byte - 256 : byte) * p.s;
  }
  return out;
}
