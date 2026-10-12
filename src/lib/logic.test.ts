import { describe, expect, it } from 'vitest';
import { cosineSimilarity, fusionScore, rankByScore } from './scoring';
import { metrics, chooseThreshold, type EvalRow } from './metrics';
import { matchStrength } from './matchStrength';
import evaluation from '../data/eval.json';
import { embeddingDimensions, MAX_UPLOAD_BYTES, validateUpload } from './uploads';

const row = (expected: string[] | null, scores: [string, number][]): EvalRow => ({
  q: 'fixture', expected, s: scores.map(([id, t]) => ({ id, t, i: t })),
});
const text = (score: { t: number }) => score.t;

describe('retrieval scoring', () => {
  it('handles aligned, orthogonal, opposite and zero vectors', () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1], [-1])).toBe(-1);
    expect(cosineSimilarity([0], [1])).toBe(0);
  });
  it('uses the stronger weighted modality and ranks without mutating input', () => {
    expect(fusionScore(0.5, 1)).toBe(0.95);
    expect(fusionScore(1, 0.5)).toBe(1);
    const entries = [1, 3, 2];
    expect(rankByScore(entries, (x) => x, 2).map((x) => x.entry)).toEqual([3, 2]);
    expect(entries).toEqual([1, 3, 2]);
    expect(rankByScore(entries, (x) => x, 0)).toEqual([]);
  });
});

describe('held-out evaluation', () => {
  it('counts multiple relevant ids, missing answers, and no-match decisions', () => {
    const rows = [row(['a', 'b'], [['x', 0.9], ['b', 0.8]]),
      row(['missing'], [['x', 0.7]]), row(null, [['x', 0.4]])];
    expect(metrics(rows, text, 0.8)).toEqual({ n: 2, top1: 0, top3: 0.5, mrr: 0.25,
      threshold: 0.8, noMatchQueries: 1, noMatchCorrectlyFlagged: 1,
      realQueriesShown: 1, realQueriesWronglyFlagged: 1 });
  });
  it('returns finite metrics for no positives or empty rankings', () => {
    expect(metrics([], text).mrr).toBe(0);
    expect(metrics([row(['a'], [])], text).top3).toBe(0);
  });
  it('chooses acceptance threshold using only supplied dev rows', () => {
    const dev = [row(['a'], [['a', 0.8]]), row(null, [['x', 0.4]])];
    const threshold = chooseThreshold(dev, text);
    expect(threshold).toBeGreaterThan(0.4);
    expect(threshold).toBeLessThanOrEqual(0.8);
    expect(metrics(dev, text, threshold).noMatchCorrectlyFlagged).toBe(1);
    expect(() => chooseThreshold([], text)).toThrow();
  });
});

describe('calibrated match strength', () => {
  it('uses the measured threshold and existing weak band at inclusive boundaries', () => {
    expect(matchStrength(evaluation.threshold)).toBe('strong');
    expect(matchStrength(evaluation.threshold - evaluation.weakBand)).toBe('weak');
    expect(matchStrength(evaluation.threshold - evaluation.weakBand - Number.EPSILON)).toBe('none');
    expect(matchStrength(NaN)).toBe('none');
  });
});

describe('upload policy', () => {
  it('accepts the size limit and rejects oversized or empty files', () => {
    expect(() => validateUpload({ size: MAX_UPLOAD_BYTES })).not.toThrow();
    expect(() => validateUpload({ size: MAX_UPLOAD_BYTES + 1 })).toThrow('image-too-large');
    expect(() => validateUpload({ size: 0 })).toThrow('empty-image');
  });
  it('bounds the longest side, preserves aspect ratio, and never upscales', () => {
    expect(embeddingDimensions(4096, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(embeddingDimensions(2048, 4096)).toEqual({ width: 1024, height: 2048 });
    expect(embeddingDimensions(100, 50)).toEqual({ width: 100, height: 50 });
    expect(() => embeddingDimensions(0, 50)).toThrow();
  });
});
