// Embed an indexed design system: node scripts/embed-system.mjs <id>
// Vectors are stored as int8 (per-vector scale) in base64 to keep the download small.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { RawImage } from '@huggingface/transformers';
import { load, embedText, embedRaw, meta, importTs, ROOT } from './precompute-core.mjs';
const { sampleDocumentText } = await importTs('src/lib/samples.ts');

export function packInt8(v) {
  const scale = Math.max(...v.map(Math.abs)) / 127 || 1;
  return { s: +scale.toPrecision(6), b: Buffer.from(Int8Array.from(v, (x) => Math.round(x / scale)).buffer).toString('base64') };
}
export async function embedFile(id) {
  const dir = path.join(ROOT, 'public/systems', id);
  const { items } = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  await load();
  const out = [];
  const t0 = Date.now();
  for (const [i, it] of items.entries()) {
    const text = await embedText(sampleDocumentText(it));
    const { data, info } = await sharp(path.join(ROOT, 'public', it.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const image = await embedRaw(new RawImage(new Uint8ClampedArray(data), info.width, info.height, 4));
    out.push({ id: it.id, text: packInt8(text), image: packInt8(image) });
    if (i % 25 === 0) console.log(`embed ${i}/${items.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  const p = path.join(dir, 'embeddings.json');
  fs.writeFileSync(p, JSON.stringify({ ...meta(), encoding: 'int8-base64', library: out }));
  console.log('wrote', p, (fs.statSync(p).size / 1024).toFixed(0) + 'KB');
}
if (import.meta.url === `file://${process.argv[1]}`) await embedFile(process.argv[2]);
