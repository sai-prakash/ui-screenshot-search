// Eval + instant-mode examples + no-match cutoff for indexed design systems.
//   node scripts/eval-systems.mjs carbon primer [--out src/data/system-eval.json] [--no-examples]
// Dev set   = scripts/system-eval-queries.json (original 22/system) + scripts/system-eval-dev-none.json.
//             Used ONLY to pick each system's no-match cutoff.
// Test set  = scripts/system-eval-heldout.json (fresh, written before the fixes were re-run). Reported, never tuned on.
import fs from 'node:fs';
import { load, embedText, cos, meta, write, importTs, ROOT } from './precompute-core.mjs';
const { queryText } = await importTs('src/lib/samples.ts');
const { fusionScore } = await importTs('src/lib/scoring.ts');
const { unpackInt8 } = await importTs('src/lib/packed.ts');
const readJ = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const devQ = readJ('./system-eval-queries.json'), devNone = readJ('./system-eval-dev-none.json'), held = readJ('./system-eval-heldout.json');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i > -1 ? argv[i + 1] : d; };
const OUT = opt('out', 'src/data/system-eval.json');
const ids = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
await load();
const modes = { text: (r) => r.t, image: (r) => r.i, fusion: (r) => fusionScore(r.t, r.i) };
const report = { ...meta(), systems: {} };

function pickCutoff(realTop, noneTop) {
  // Youden's J over candidate thresholds; ties broken toward fewer false flags of real queries (higher cutoff loses fewer).
  const cands = [...realTop, ...noneTop].sort((a, b) => a - b).map((v, i, a) => (i ? (v + a[i - 1]) / 2 : v - 1e-4));
  let best = { j: -Infinity, c: 0 };
  for (const c of cands) {
    const tpr = noneTop.filter((s) => s < c).length / noneTop.length;
    const fpr = realTop.filter((s) => s < c).length / realTop.length;
    const j = tpr - fpr;
    if (j > best.j + 1e-9 || (Math.abs(j - best.j) < 1e-9 && fpr < best.fpr)) best = { j, c, tpr, fpr };
  }
  return +best.c.toFixed(4);
}

for (const id of ids) {
  const dir = `${ROOT}/public/systems/${id}`;
  const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
  const cat = new Map(manifest.items.map((it) => [it.id, it.category]));
  const lib = JSON.parse(fs.readFileSync(`${dir}/embeddings.json`)).library
    .map((e) => ({ id: e.id, text: unpackInt8(e.text), image: unpackInt8(e.image) }));
  const presentCats = new Set(manifest.items.map((i) => i.category));
  const rank = async (q) => {
    const v = await embedText(queryText(q));
    return lib.map((e) => ({ id: e.id, t: cos(v, e.text), i: cos(v, e.image) }));
  };
  async function scoreSet(qs) {
    const counts = Object.fromEntries(Object.keys(modes).map((m) => [m, { top1: 0, top3: 0, n: qs.length }]));
    const perQuery = [];
    for (const q of qs) {
      const rows = await rank(q.q);
      for (const [m, f] of Object.entries(modes)) {
        const top = [...rows].sort((a, b) => f(b) - f(a)).slice(0, 3).map((r) => cat.get(r.id));
        if (q.expected.includes(top[0])) counts[m].top1++;
        if (top.some((c) => q.expected.includes(c))) counts[m].top3++;
      }
      const top3 = [...rows].sort((a, b) => modes.fusion(b) - modes.fusion(a)).slice(0, 3);
      perQuery.push({ q: q.q, expected: q.expected, expectedPresent: q.expected.some((c) => presentCats.has(c)),
        topScore: +modes.fusion(top3[0]).toFixed(4), top3: top3.map((r) => [cat.get(r.id), r.id, +modes.fusion(r).toFixed(4)]) });
    }
    return { modes: counts, perQuery };
  }
  async function topScores(list) {
    const out = [];
    for (const q of list) { const rows = await rank(q); out.push({ q, topScore: +Math.max(...rows.map(modes.fusion)).toFixed(4) }); }
    return out;
  }
  const dev = await scoreSet(devQ[id]);
  const devNoneS = await topScores(devNone[id]);
  const cutoff = pickCutoff(dev.perQuery.map((p) => p.topScore), devNoneS.map((p) => p.topScore));
  const test = await scoreSet(held[id].test);
  const testNoneS = await topScores(held[id].none.map((n) => n.q));
  const flag = (s) => s < cutoff;
  const res = {
    stories: lib.length, components: presentCats.size, cutoff,
    dev: { modes: dev.modes, noneFlagged: devNoneS.filter((p) => flag(p.topScore)).length, noneN: devNoneS.length,
      realFlagged: dev.perQuery.filter((p) => flag(p.topScore)).length },
    test: { modes: test.modes, noneFlagged: testNoneS.filter((p) => flag(p.topScore)).length, noneN: testNoneS.length,
      realFlagged: test.perQuery.filter((p) => flag(p.topScore)).length, perQuery: test.perQuery, none: testNoneS },
  };
  report.systems[id] = res;
  if (!argv.includes('--no-examples')) {
    const examples = [];
    for (const q of devQ[id].slice(0, 8)) {
      const rows = await rank(q.q);
      examples.push({ query: q.q, results: [...rows].sort((a, b) => modes.fusion(b) - modes.fusion(a)).slice(0, 6)
        .map((r) => ({ id: r.id, score: +modes.fusion(r).toFixed(4) })) });
    }
    write(`public/systems/${id}/examples.json`, { ...meta(), cutoff, examples });
  }
  console.log(id, 'cutoff', cutoff, 'DEV', JSON.stringify(res.dev), 'TEST', JSON.stringify({ ...res.test, perQuery: undefined, none: undefined }));
}
write(OUT, report);
