import evaluation from '../data/eval.json';

/** The weak band extends below the dev-selected acceptance threshold. */
export function matchStrength(score: number): 'strong' | 'weak' | 'none' {
  if (!Number.isFinite(score)) return 'none';
  if (score >= evaluation.threshold) return 'strong';
  return score >= evaluation.threshold - evaluation.weakBand ? 'weak' : 'none';
}
