import fs from 'node:fs';
import { load, embedText, cos, meta, write, importTs, ROOT } from './precompute-core.mjs';
const { queryText } = await importTs('src/lib/samples.ts');
const { metrics, chooseThreshold } = await importTs('src/lib/metrics.ts');
const { fusionScore } = await importTs('src/lib/scoring.ts');
const queries = JSON.parse(fs.readFileSync(new URL('./eval-queries.json', import.meta.url)));
const { library } = JSON.parse(fs.readFileSync(`${ROOT}/public/library-embeddings.json`));
await load();
async function scoreAll(set) {
  const rows = [];
  for (const query of set) {
    const vector = await embedText(queryText(query.q));
    rows.push({ ...query, s: library.map((entry) => ({ id: entry.id, t: cos(vector, entry.text), i: cos(vector, entry.image) })) });
  }
  return rows;
}
const modes = { text: (r) => r.t, image: (r) => r.i, fusion: (r) => fusionScore(r.t, r.i) };
const dev = await scoreAll(queries.dev);
const threshold = chooseThreshold(dev, modes.fusion);
const test = await scoreAll(queries.test);
const previous = JSON.parse(fs.readFileSync(`${ROOT}/src/data/eval.json`));
const output = { ...meta(), threshold, weakBand: previous.weakBand,
  dev: Object.fromEntries(Object.entries(modes).map(([name, score]) => [name, metrics(dev, score, name === 'fusion' ? threshold : undefined)])),
  test: Object.fromEntries(Object.entries(modes).map(([name, score]) => [name, metrics(test, score, name === 'fusion' ? threshold : undefined)])),
  perQuery: test.map((row) => ({ q: row.q, expected: row.expected,
    top3: [...row.s].sort((a, b) => modes.fusion(b) - modes.fusion(a)).slice(0, 3).map((r) => [r.id, +modes.fusion(r).toFixed(4)]) })) };
write('src/data/eval.json', output);
console.log(JSON.stringify(output.test, null, 2));
