import evaluation from '../data/eval.json';

type Split = typeof evaluation.test;

/** Turn held-out test rates back into counts so the UI never shows a number eval.json doesn't contain. */
export function evalSummary(test: Split = evaluation.test) {
  const n = test.fusion.n;
  const count = (rate: number) => Math.round(rate * n);
  return {
    n,
    fusion: { top1: count(test.fusion.top1), top3: count(test.fusion.top3) },
    text: { top1: count(test.text.top1), top3: count(test.text.top3) },
    noMatchQueries: test.fusion.noMatchQueries,
    noMatchFlagged: test.fusion.noMatchCorrectlyFlagged,
    realWronglyFlagged: test.fusion.realQueriesWronglyFlagged,
  };
}

/** Similarity boundaries behind the Strong / Weak / No match labels, for display. */
export const STRONG_FROM = evaluation.threshold;
export const WEAK_FROM = evaluation.threshold - evaluation.weakBand;
