import {
  cosineSimilarity,
  embedImageBlob,
  embedImageUrl,
  embedText,
} from './embedder';
import {
  SAMPLES,
  queryText,
  sampleDocumentText,
  type SampleComponent,
} from './samples';

export type IndexedSample = SampleComponent & {
  textEmbedding: Float32Array;
  imageEmbedding: Float32Array;
};

export type SearchHit = SampleComponent & {
  score: number;
  match: 'text' | 'image' | 'both';
};

let index: IndexedSample[] | null = null;

export function getIndex(): IndexedSample[] | null {
  return index;
}

export async function buildIndex(
  onItem?: (done: number, total: number, label: string) => void,
): Promise<IndexedSample[]> {
  const out: IndexedSample[] = [];
  const total = SAMPLES.length;

  for (let i = 0; i < SAMPLES.length; i++) {
    const sample = SAMPLES[i]!;
    onItem?.(i, total, sample.label);
    const textEmbedding = await embedText(sampleDocumentText(sample));
    const imageEmbedding = await embedImageUrl(sample.src);
    out.push({ ...sample, textEmbedding, imageEmbedding });
  }

  onItem?.(total, total, 'done');
  index = out;
  return out;
}

function rank(
  query: Float32Array,
  field: 'textEmbedding' | 'imageEmbedding',
  topK: number,
  match: SearchHit['match'],
): SearchHit[] {
  if (!index) return [];
  return index
    .map((item) => ({
      ...item,
      score: cosineSimilarity(query, item[field]),
      match,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ textEmbedding: _t, imageEmbedding: _i, ...rest }) => rest);
}

export async function searchByText(
  q: string,
  topK = 6,
): Promise<SearchHit[]> {
  const embedding = await embedText(queryText(q.trim()));
  // Prefer text corpus for typed queries; image corpus as soft secondary via max.
  if (!index) return [];
  return index
    .map((item) => {
      const textScore = cosineSimilarity(embedding, item.textEmbedding);
      const imageScore = cosineSimilarity(embedding, item.imageEmbedding);
      const score = Math.max(textScore, imageScore * 0.95);
      const match: SearchHit['match'] =
        textScore >= imageScore ? 'text' : 'both';
      return { ...item, score, match };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ textEmbedding: _t, imageEmbedding: _i, ...rest }) => rest);
}

export async function searchByImageBlob(
  blob: Blob,
  topK = 6,
): Promise<SearchHit[]> {
  const embedding = await embedImageBlob(blob);
  return rank(embedding, 'imageEmbedding', topK, 'image');
}
