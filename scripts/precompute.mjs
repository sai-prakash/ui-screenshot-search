import { load, embedText, embedSvg, cos, round, meta, write, importTs } from './precompute-core.mjs';
const { fusionScore } = await importTs('src/lib/scoring.ts');
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
    return { id: l.id, score: +fusionScore(textScore, imageScore).toFixed(4), textScore: +textScore.toFixed(4), imageScore: +imageScore.toFixed(4) };
  }).sort((a, b) => b.score - a.score).slice(0, 6);
  examples.push({ query: q, results: ranked });
  console.log(q, '->', ranked.slice(0, 3).map((r) => `${r.id} ${r.score}`).join(', '));
}
write('src/data/examples.json', { ...meta(), examples });
write('public/library-embeddings.json', { ...meta(), library: library.map((l) => ({ id: l.id, text: round(l.text), image: round(l.image) })) });
