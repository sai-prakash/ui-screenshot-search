import { describe, expect, it } from 'vitest';
import { unpackInt8 } from './packed';
import { cosineSimilarity } from './scoring';
import { SYSTEMS } from './systems';

// Mirror of packInt8 in scripts/embed-system.mjs.
function pack(v: number[]) {
  const s = Math.max(...v.map(Math.abs)) / 127 || 1;
  return { s, b: Buffer.from(Int8Array.from(v, (x) => Math.round(x / s)).buffer).toString('base64') };
}

describe('int8 packed embeddings', () => {
  it('round-trips with cosine ~1 and keeps sign', () => {
    const v = Array.from({ length: 768 }, (_, i) => Math.sin(i * 1.7) * 0.1);
    const u = unpackInt8(pack(v));
    expect(u.length).toBe(768);
    expect(cosineSimilarity(v, u)).toBeGreaterThan(0.999);
    expect(Math.sign(u[1]!)).toBe(Math.sign(v[1]!));
  });
  it('lists the sample plus indexed systems with licenses', () => {
    expect(SYSTEMS[0]!.id).toBe('sample');
    expect(SYSTEMS.filter((s) => s.id !== 'sample').every((s) => s.license)).toBe(true);
  });
});
