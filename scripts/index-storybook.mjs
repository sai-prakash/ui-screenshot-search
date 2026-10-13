// Index any public Storybook (v7+ /index.json or v6 /stories.json) for UI Search.
//
//   node scripts/index-storybook.mjs --url https://react.carbondesignsystem.com \
//        --id carbon --name "IBM Carbon" --license Apache-2.0 [--max 400] [--per-component 6]
//        [--skip-embed] [--concurrency 4] [--chrome /usr/bin/google-chrome]
//
// 1. Reads the story index and drops docs entries.
// 2. Picks stories round-robin across components (so one component can't eat the cap).
// 3. Screenshots each story's iframe with Playwright, trims whitespace, saves a WebP thumbnail.
// 4. Drops visually identical screenshots (perceptual dedupe).
// 5. Embeds text + image with the same model and document format as the sample library.
// Output: public/systems/<id>/{manifest.json, embeddings.json, thumbs/*.webp}
// Needs: npm i --no-save sharp playwright-core   (and a Chrome/Chromium binary)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { chromium } from 'playwright-core';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const BASE = arg('url')?.replace(/\/(index|stories)\.json$/, '').replace(/\/$/, '');
const ID = arg('id');
if (!BASE || !ID) { console.error('usage: --url <storybook base> --id <slug> [--name] [--license]'); process.exit(1); }
const NAME = arg('name', ID), LICENSE = arg('license', 'unknown');
const MAX = +arg('max', 400), PER = +arg('per-component', 6), CONC = +arg('concurrency', 4);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public/systems', ID);
fs.mkdirSync(path.join(OUT, 'thumbs'), { recursive: true });

// ---- 1. index ----
async function getIndex() {
  for (const f of ['index.json', 'stories.json']) {
    const r = await fetch(`${BASE}/${f}`);
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    const entries = j?.entries ?? j?.stories;
    if (entries) return Object.values(entries);
  }
  throw new Error(`No index.json or stories.json under ${BASE}`);
}
const SKIP = /deprecated|experimental|unstable|internal|playground|test|dev ?only|figma|overview|kitchen ?sink|\bdocs?\b/i;
const all = (await getIndex()).filter((e) =>
  (e.type ?? 'story') === 'story' && !(e.tags ?? []).includes('docs') && !e.parameters?.docsOnly && !SKIP.test(`${e.title} ${e.name}`));
// round-robin across components
const groups = new Map();
for (const e of all) { const g = groups.get(e.title) ?? []; if (g.length < PER) g.push(e); groups.set(e.title, g); }
const picked = [];
for (let round = 0; picked.length < MAX && round < PER; round++)
  for (const g of groups.values()) if (g[round] && picked.length < MAX) picked.push(g[round]);
console.log(`${NAME}: ${all.length} candidate stories in ${groups.size} components -> ${picked.length} picked`);

// ---- 2. screenshots ----
const browser = await chromium.launch({ executablePath: arg('chrome', '/usr/bin/google-chrome') });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 720 }, reducedMotion: 'reduce' });
const items = [], seen = new Map();
let failed = 0, dupes = 0;
async function shoot(e) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/iframe.html?id=${e.id}&viewMode=story`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(400);
    const png = await page.screenshot({ animations: 'disabled' });
    let img = sharp(png).flatten({ background: '#ffffff' });
    try { img = sharp(await img.trim({ threshold: 12 }).toBuffer()); } catch { /* blank page */ }
    const { width = 0, height = 0 } = await img.metadata();
    if (width < 8 || height < 8) throw new Error('blank render');
    const webp = await img.extend({ top: 16, bottom: 16, left: 16, right: 16, background: '#ffffff' })
      .resize({ width: 480, height: 360, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    // perceptual dedupe: 16x16 grayscale hash
    const tiny = await sharp(webp).resize(16, 16, { fit: 'fill' }).grayscale().raw().toBuffer();
    const hash = crypto.createHash('sha1').update(Buffer.from(tiny.map((v) => v >> 4))).digest('hex');
    if (seen.has(hash)) { dupes++; return; }
    seen.set(hash, e.id);
    fs.writeFileSync(path.join(OUT, 'thumbs', `${e.id}.webp`), webp);
    const parts = e.title.split('/');
    const component = parts.length > 1 ? parts[1] : parts[0];
    items.push({ id: e.id, label: `${component} · ${e.name}`, category: component, title: e.title,
      description: `${e.title.replace(/\//g, ' › ')} story "${e.name}"`, tags: [],
      src: `/systems/${ID}/thumbs/${e.id}.webp`, url: `${BASE}/?path=/story/${e.id}` });
  } catch (err) { failed++; console.warn('skip', e.id, String(err.message).split('\n')[0]); }
  finally { await page.close(); }
}
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < picked.length) { const e = picked[next++]; await shoot(e); if ((next % 25) === 0) console.log(`${next}/${picked.length}`); }
}));
await browser.close();
const order = new Map(picked.map((e, i) => [e.id, i]));
items.sort((a, b) => order.get(a.id) - order.get(b.id));
console.log(`screenshots: ${items.length} kept, ${dupes} duplicates dropped, ${failed} failed`);
const manifest = { id: ID, name: NAME, source: BASE, license: LICENSE, indexedAt: new Date().toISOString(),
  stats: { candidates: all.length, components: groups.size, picked: picked.length, kept: items.length, duplicates: dupes, failed }, items };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
if (flag('skip-embed')) process.exit(0);

// ---- 3. embeddings (same model + document format as the sample library) ----
const { embedFile } = await import('./embed-system.mjs');
await embedFile(ID);
