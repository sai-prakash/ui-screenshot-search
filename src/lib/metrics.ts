export type EvalScore = { id: string; t: number; i: number };
export type EvalRow = { q: string; expected: string[] | null; s: EvalScore[] };
export type ScoreFunction = (score: EvalScore) => number;

export function metrics(rows: EvalRow[], score: ScoreFunction, threshold?: number) {
  const positive = rows.filter((r) => r.expected?.length);
  const negative = rows.filter((r) => !r.expected?.length);
  let top1 = 0, top3 = 0, rr = 0, accepted = 0, rejected = 0;
  for (const row of rows) {
    const ranked = [...row.s].sort((a, b) => score(b) - score(a));
    const best = ranked.length ? score(ranked[0]!) : -Infinity;
    if (row.expected?.length) {
      const index = ranked.findIndex((x) => row.expected!.includes(x.id));
      if (index === 0) top1++;
      if (index >= 0 && index < 3) top3++;
      if (index >= 0) rr += 1 / (index + 1);
      if (threshold !== undefined && best >= threshold) accepted++;
    } else if (threshold !== undefined && best < threshold) rejected++;
  }
  return { n: positive.length, top1: positive.length ? top1 / positive.length : 0,
    top3: positive.length ? top3 / positive.length : 0, mrr: positive.length ? rr / positive.length : 0,
    ...(threshold !== undefined ? { threshold, noMatchQueries: negative.length,
      noMatchCorrectlyFlagged: rejected, realQueriesShown: accepted,
      realQueriesWronglyFlagged: positive.length - accepted } : {}) };
}

/** Tune acceptance on dev only. Ties prefer the lowest threshold. */
export function chooseThreshold(dev: EvalRow[], score: ScoreFunction): number {
  if (!dev.length) throw new Error('Cannot calibrate without dev queries');
  const bestScores = dev.map((r) => Math.max(...r.s.map(score)));
  if (bestScores.some((s) => !Number.isFinite(s))) throw new Error('Dev queries need finite scores');
  const candidates = [...new Set(bestScores.flatMap((s) => [s, s + Number.EPSILON]))].sort((a, b) => a - b);
  let best = candidates[0]!, correct = -1;
  for (const threshold of candidates) {
    const count = dev.reduce((sum, row, i) => sum + Number(Boolean(row.expected?.length) === (bestScores[i]! >= threshold)), 0);
    if (count > correct) { best = threshold; correct = count; }
  }
  return best;
}
