import { cosineSimilarity, fusionScore, rankByScore } from './scoring';
import { embedImageBlob, embedText } from './embedder';
import { queryText, SAMPLES, type SampleComponent } from './samples';
import type { Hit } from './library';
import { unpackInt8 } from './packed';
import { fetchJson, type PackedLibrary, type SystemId } from './systems';
export { loadEmbedder } from './embedder';

type LibEntry = { id: string; text: ArrayLike<number>; image: ArrayLike<number> };
type Loaded = { entries: LibEntry[]; items: Map<string, SampleComponent> };
const cache = new Map<SystemId, Loaded>();
let current: Loaded | null = null;

/**
 * Library embeddings were computed at build time with the same model
 * (scripts/precompute.mjs for the sample, scripts/index-storybook.mjs for real
 * design systems), so live mode only has to embed your query.
 */
export async function loadLibrary(system: SystemId = 'sample', items: SampleComponent[] = SAMPLES): Promise<void> {
  let lib = cache.get(system);
  if (!lib) {
    const entries: LibEntry[] = system === 'sample'
      ? (await fetchJson<{ library: LibEntry[] }>('/library-embeddings.json')).library
      : (await fetchJson<PackedLibrary>(`/systems/${system}/embeddings.json`)).library
          .map((e) => ({ id: e.id, text: unpackInt8(e.text), image: unpackInt8(e.image) }));
    lib = { entries, items: new Map(items.map((i) => [i.id, i])) };
    cache.set(system, lib);
  }
  current = lib;
}

function rank(score: (e: LibEntry) => number, topK: number): Hit[] {
  const lib = current;
  if (!lib) return [];
  return rankByScore(lib.entries.filter((e) => lib.items.has(e.id)), score, topK)
    .map(({ entry, score }) => ({ item: lib.items.get(entry.id)!, score }));
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
