// Eval + instant-mode examples for indexed design systems.
// node scripts/eval-systems.mjs carbon primer
import fs from 'node:fs';
import { load, embedText, cos, meta, write, importTs, ROOT } from './precompute-core.mjs';
const { queryText } = await importTs('src/lib/samples.ts');
const { fusionScore } = await importTs('src/lib/scoring.ts');
const { unpackInt8 } = await importTs('src/lib/packed.ts');
const allQueries = JSON.parse(fs.readFileSync(new URL('./system-eval-queries.json', import.meta.url)));
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
await load();
const modes = { text: (r) => r.t, image: (r) => r.i, fusion: (r) => fusionScore(r.t, r.i) };
const report = { ...meta(), systems: {} };
for (const id of ids) {
  const dir = `${ROOT}/public/systems/${id}`;
  const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
  const cat = new Map(manifest.items.map((it) => [it.id, it.category]));
  const lib = JSON.parse(fs.readFileSync(`${dir}/embeddings.json`)).library
    .map((e) => ({ id: e.id, text: unpackInt8(e.text), image: unpackInt8(e.image) }));
  const presentCats = new Set(manifest.items.map((i) => i.category));
  const qs = allQueries[id];
  const res = { stories: lib.length, components: presentCats.size, queries: qs.length, modes: {}, perQuery: [] };
  const counts = Object.fromEntries(Object.keys(modes).map((m) => [m, { top1: 0, top3: 0 }]));
  const examples = [];
  for (const q of qs) {
    const v = await embedText(queryText(q.q));
    const rows = lib.map((e) => ({ id: e.id, t: cos(v, e.text), i: cos(v, e.image) }));
    for (const [m, f] of Object.entries(modes)) {
      const top = [...rows].sort((a, b) => f(b) - f(a)).slice(0, 3).map((r) => cat.get(r.id));
      if (q.expected.includes(top[0])) counts[m].top1++;
      if (top.some((c) => q.expected.includes(c))) counts[m].top3++;
    }
    const ranked = [...rows].sort((a, b) => modes.fusion(b) - modes.fusion(a)).slice(0, 6)
      .map((r) => ({ id: r.id, score: +modes.fusion(r).toFixed(4) }));
    res.perQuery.push({ q: q.q, expected: q.expected, expectedPresent: q.expected.some((c) => presentCats.has(c)),
      top3: ranked.slice(0, 3).map((r) => [cat.get(r.id), r.id, r.score]) });
    examples.push({ query: q.q, results: ranked });
  }
  for (const [m, c] of Object.entries(counts)) res.modes[m] = { top1: c.top1, top3: c.top3, n: qs.length };
  report.systems[id] = res;
  write(`public/systems/${id}/examples.json`, { ...meta(), examples });
  console.log(id, JSON.stringify(res.modes));
}
write('src/data/system-eval.json', report);
