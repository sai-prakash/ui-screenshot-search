import { cosineSimilarity, embedImageBlob, embedText } from './embedder';
import { SAMPLES, queryText, type SampleComponent } from './samples';

export type Hit = { item: SampleComponent; score: number };

type LibEntry = { id: string; text: number[]; image: number[] };
let library: LibEntry[] | null = null;

/**
 * Library embeddings were computed at build time with the same model
 * (scripts/precompute.mjs), so live mode only has to embed your query.
 */
export async function loadLibrary(): Promise<void> {
  if (library) return;
  const res = await fetch('/library-embeddings.json');
  if (!res.ok) throw new Error('fetch library failed');
  library = (await res.json()).library as LibEntry[];
}

const byId = new Map(SAMPLES.map((s) => [s.id, s]));
export const sampleById = (id: string) => byId.get(id)!;

function rank(score: (e: LibEntry) => number, topK: number): Hit[] {
  if (!library) return [];
  return library
    .map((e) => ({ item: byId.get(e.id)!, score: score(e) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function searchByText(q: string, topK = 6): Promise<Hit[]> {
  const v = await embedText(queryText(q.trim()));
  return rank(
    (e) => Math.max(cosineSimilarity(v, e.text), cosineSimilarity(v, e.image) * 0.95),
    topK,
  );
}

export async function searchByImage(blob: Blob, topK = 6): Promise<Hit[]> {
  const v = await embedImageBlob(blob);
  return rank((e) => cosineSimilarity(v, e.image), topK);
}
