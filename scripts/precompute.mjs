import { load, embedText, embedSvg, cos, round, meta, write, importTs } from './precompute-core.mjs';
const { SAMPLES, sampleDocumentText, queryText } = await importTs('src/lib/samples.ts');
export const EXAMPLE_QUERIES = [
  'pill toggle for filters', 'confirm before deleting', 'show progress of upload',
  'KPI tile for the dashboard', 'something to tell people nothing is here yet',
  "where do I put the user's picture", 'pick a date range',
];
await load();
const library = [];
for (const s of SAMPLES) library.push({ id: s.id, text: await embedText(sampleDocumentText(s)), image: await embedSvg(s.src) });
const examples = [];
for (const q of EXAMPLE_QUERIES) {
  const e = await embedText(queryText(q));
  const ranked = library.map((l) => {
    const textScore = cos(e, l.text), imageScore = cos(e, l.image);
    return { id: l.id, score: +Math.max(textScore, imageScore * 0.95).toFixed(4), textScore: +textScore.toFixed(4), imageScore: +imageScore.toFixed(4) };
  }).sort((a, b) => b.score - a.score).slice(0, 6);
  examples.push({ query: q, results: ranked });
  console.log(q, '->', ranked.slice(0, 3).map((r) => `${r.id} ${r.score}`).join(', '));
}
write('src/data/examples.json', { ...meta(), examples });
write('public/library-embeddings.json', { ...meta(), library: library.map((l) => ({ id: l.id, text: round(l.text), image: round(l.image) })) });

// ---- Measured eval (held-out queries in scripts/eval-queries.json) ----
import fsE from 'node:fs';
const E = JSON.parse(fsE.readFileSync(new URL('./eval-queries.json', import.meta.url)));
async function scoreAll(set) {
  const out = [];
  for (const x of set) {
    const e = await embedText(queryText(x.q));
    const s = library.map((l) => ({ id: l.id, t: cos(e, l.text), i: cos(e, l.image) }));
    out.push({ ...x, s });
  }
  return out;
}
const modes = { text: (r) => r.t, image: (r) => r.i, fusion: (r) => Math.max(r.t, r.i * 0.95) };
function metrics(rows, f, T) {
  const pos = rows.filter((r) => r.expected), neg = rows.filter((r) => !r.expected);
  let top1 = 0, top3 = 0, rr = 0, accepted = 0, acceptedCorrect = 0, negRejected = 0;
  for (const r of rows) {
    const ranked = [...r.s].sort((a, b) => f(b) - f(a));
    const best = f(ranked[0]);
    if (r.expected) {
      const rank = ranked.findIndex((x) => r.expected.includes(x.id)) + 1;
      if (rank === 1) top1++; if (rank <= 3) top3++; rr += 1 / rank;
      if (T !== undefined && best >= T) { accepted++; if (rank === 1) acceptedCorrect++; }
    } else if (T !== undefined && best < T) negRejected++;
  }
  return { n: pos.length, top1: top1 / pos.length, top3: top3 / pos.length, mrr: rr / pos.length,
    ...(T !== undefined ? { threshold: T, noMatchQueries: neg.length, noMatchCorrectlyFlagged: negRejected, realQueriesShown: accepted, realQueriesWronglyFlagged: pos.length - accepted } : {}) };
}
const dev = await scoreAll(E.dev), test = await scoreAll(E.test);
// Pick the threshold on dev only: maximise correct accept/reject decisions.
let bestT = 0.6, bestAcc = -1;
for (let T = 0.5; T <= 0.8; T += 0.005) {
  let ok = 0;
  for (const r of dev) { const top = Math.max(...r.s.map(modes.fusion)); ok += r.expected ? (top >= T ? 1 : 0) : (top < T ? 1 : 0); }
  if (ok > bestAcc) { bestAcc = ok; bestT = +T.toFixed(3); }
}
const evalOut = { ...meta(), threshold: bestT, weakBand: 0.04,
  test: Object.fromEntries(Object.entries(modes).map(([k, f]) => [k, metrics(test, f, k === 'fusion' ? bestT : undefined)])),
  perQuery: test.map((r) => { const ranked = [...r.s].sort((a, b) => modes.fusion(b) - modes.fusion(a)); return { q: r.q, expected: r.expected, top3: ranked.slice(0, 3).map((x) => [x.id, +modes.fusion(x).toFixed(4)]) }; }) };
write('src/data/eval.json', evalOut);
console.log(JSON.stringify(evalOut.test, null, 1));
