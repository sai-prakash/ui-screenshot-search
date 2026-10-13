import evaluation from '../data/eval.json';

/** The weak band extends below the dev-selected acceptance threshold. */
export function matchStrength(score: number): 'strong' | 'weak' | 'none' {
  if (!Number.isFinite(score)) return 'none';
  if (score >= evaluation.threshold) return 'strong';
  return score >= evaluation.threshold - evaluation.weakBand ? 'weak' : 'none';
}

/** Width of the "Weak match" band below a design system's cutoff. */
export const SYSTEM_WEAK_BAND = 0.03;
const EPS = 1e-9;

/** Label for an indexed design system, using that system's own dev-tuned cutoff. Null when no cutoff exists. */
export function systemMatch(score: number, cutoff: number | null | undefined): 'good' | 'weak' | 'unlikely' | null {
  if (cutoff == null || !Number.isFinite(cutoff)) return null;
  if (!Number.isFinite(score)) return 'unlikely';
  if (score >= cutoff - EPS) return 'good';
  return score >= cutoff - SYSTEM_WEAK_BAND - EPS ? 'weak' : 'unlikely';
}

export type MatchTone = 'good' | 'weak' | 'none' | 'neutral';
export type MatchLabel = { text: string; tone: MatchTone };
export type MatchContext = { system: string; input: 'text' | 'image'; cutoff?: number | null };

const SAMPLE_LABEL = {
  strong: { text: 'Strong match', tone: 'good' },
  weak: { text: 'Weak match', tone: 'weak' },
  none: { text: 'No match', tone: 'none' },
} as const;
const SYSTEM_LABEL = {
  good: { text: 'Good match', tone: 'good' },
  weak: { text: 'Weak match', tone: 'weak' },
  unlikely: { text: 'Unlikely', tone: 'none' },
} as const;
const CLOSEST: MatchLabel = { text: 'Closest', tone: 'neutral' };

/**
 * Plain-language label for one result. Thresholds were tuned on text queries,
 * so image searches only get "Closest".
 */
export function matchLabel(score: number, ctx: MatchContext): MatchLabel {
  if (ctx.input !== 'text') return CLOSEST;
  if (ctx.system === 'sample') return SAMPLE_LABEL[matchStrength(score)];
  const m = systemMatch(score, ctx.cutoff);
  return m ? SYSTEM_LABEL[m] : CLOSEST;
}

/** True when even the best result is below the acceptance cutoff (text searches only). */
export function isNoMatch(topScore: number | undefined, ctx: MatchContext): boolean {
  if (ctx.input !== 'text' || topScore === undefined) return false;
  if (ctx.system === 'sample') return matchStrength(topScore) !== 'strong';
  const m = systemMatch(topScore, ctx.cutoff);
  return m !== null && m !== 'good';
}
