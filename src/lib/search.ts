import { cosineSimilarity, fusionScore, rankByScore } from './scoring';
import { embedImageBlob, embedText } from './embedder';
import { queryText } from './samples';
import { byId, type Hit } from './library';
export { loadEmbedder } from './embedder';


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


function rank(score: (e: LibEntry) => number, topK: number): Hit[] {
  if (!library) return [];
  return rankByScore(library, score, topK)
    .map(({ entry, score }) => ({ item: byId.get(entry.id)!, score }));
}

export async function searchByText(q: string, topK = 6): Promise<Hit[]> {
  const v = await embedText(queryText(q.trim()));
  return rank(
    (e) => fusionScore(cosineSimilarity(v, e.text), cosineSimilarity(v, e.image)),
    topK,
  );
}

export async function searchByImage(blob: Blob, topK = 6): Promise<Hit[]> {
  const v = await embedImageBlob(blob);
  return rank((e) => cosineSimilarity(v, e.image), topK);
}
