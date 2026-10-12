export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}


export function fusionScore(text: number, image: number): number {
  return Math.max(text, image * 0.95);
}

export function rankByScore<T>(entries: readonly T[], score: (entry: T) => number, topK: number): { entry: T; score: number }[] {
  return entries.map((entry) => ({ entry, score: score(entry) }))
    .sort((a, b) => b.score - a.score).slice(0, Math.max(0, topK));
}
