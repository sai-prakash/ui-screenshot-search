// Build-time precompute: runs the same model (EmbeddingGemma 2, q8, CPU) in Node.
// Usage: npm i --no-save sharp && node scripts/precompute.mjs
import { AutoConfig, AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

export const MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let proc, model;
export async function load() {
  const config = await AutoConfig.from_pretrained(MODEL_ID);
  config.audio_config = null;
  proc = await AutoProcessor.from_pretrained(MODEL_ID);
  model = await AutoModel.from_pretrained(MODEL_ID, { config, device: 'cpu', dtype: 'q8' });
}
async function emb(text, image) {
  const out = await model(await proc(text, image ?? null));
  const e = out.sentence_embedding;
  return Array.from(e.data).slice(0, e.dims.at(-1));
}
export const embedText = (t) => emb(t);
export async function embedSvg(publicSrc) {
  const { data, info } = await sharp(path.join(ROOT, 'public', publicSrc))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return emb(null, new RawImage(new Uint8ClampedArray(data), info.width, info.height, 4));
}
export function cos(a, b) {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; }
  return d / Math.sqrt(x * y);
}
export const round = (v) => v.map((n) => +n.toFixed(5));
export function meta() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/@huggingface/transformers/package.json'), 'utf8'));
  return { model: MODEL_ID, dtype: 'q8', runtime: `Node, Transformers.js ${pkg.version}, onnxruntime CPU`, generatedAt: new Date().toISOString() };
}
export function write(rel, obj) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
  console.log('wrote', rel, (fs.statSync(p).size / 1024).toFixed(0) + 'KB');
}
// Load a TS data module's exported arrays without a TS toolchain.
export async function importTs(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/^import type .*$/gm, '')
    .replace(/export type [\s\S]*?\n};\n/g, '')
    .replace(/: [A-Za-z]+\[\]( =)/g, '$1')
    .replace(/\(([a-z]+): [A-Za-z]+\)(: string)?/g, '($1)')
    .replace(/\(([a-z]+): string\)(: string)?/g, '($1)');
  const tmp = path.join(ROOT, 'scripts', '.tmp-' + path.basename(rel, '.ts') + '.mjs');
  fs.writeFileSync(tmp, src);
  try { return await import(tmp + '?' + Date.now()); } finally { fs.unlinkSync(tmp); }
}
