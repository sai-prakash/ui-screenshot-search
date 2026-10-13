import { describe, expect, it } from 'vitest';
import { gridMove, isTypingTarget, matchExample, shouldFocusSearch } from './keys';
import { isNoMatch, matchLabel, systemMatch } from '../lib/matchStrength';
import { componentName, storyName, splitCamel, systemCutoff, systemEvalSummary, type Item } from '../lib/systems';
import evaluation from '../data/eval.json';

describe('system match labels', () => {
  it('uses the per-system cutoff with a 0.03 weak band', () => {
    expect(systemMatch(0.72, 0.7)).toBe('good');
    expect(systemMatch(0.7, 0.7)).toBe('good');
    expect(systemMatch(0.69, 0.7)).toBe('weak');
    expect(systemMatch(0.67, 0.7)).toBe('weak');
    expect(systemMatch(0.669, 0.7)).toBe('unlikely');
    expect(systemMatch(Number.NaN, 0.7)).toBe('unlikely');
  });
  it('has no label without a cutoff', () => {
    expect(systemMatch(0.9, undefined)).toBeNull();
    expect(matchLabel(0.9, { system: 'carbon', input: 'text' })).toEqual({ text: 'Closest', tone: 'neutral' });
    expect(isNoMatch(0.1, { system: 'carbon', input: 'text' })).toBe(false);
  });
  it('maps to plain-language labels and flags no-match', () => {
    const ctx = { system: 'primer', input: 'text' as const, cutoff: 0.7 };
    expect(matchLabel(0.75, ctx).text).toBe('Good match');
    expect(matchLabel(0.68, ctx).text).toBe('Weak match');
    expect(matchLabel(0.6, ctx).text).toBe('Unlikely');
    expect(isNoMatch(0.68, ctx)).toBe(true);
    expect(isNoMatch(0.71, ctx)).toBe(false);
    expect(matchLabel(0.75, { ...ctx, input: 'image' }).text).toBe('Closest');
    expect(isNoMatch(0.1, { ...ctx, input: 'image' })).toBe(false);
  });
  it('keeps the sample on its own Strong / Weak / No match scale', () => {
    const ctx = { system: 'sample', input: 'text' as const };
    expect(matchLabel(evaluation.threshold + 0.01, ctx).text).toBe('Strong match');
    expect(matchLabel(evaluation.threshold - 0.01, ctx).text).toBe('Weak match');
    expect(matchLabel(0, ctx).text).toBe('No match');
    expect(isNoMatch(evaluation.threshold - 0.01, ctx)).toBe(true);
  });
});

describe('"/" shortcut guard', () => {
  it('focuses search only when not typing and without modifiers', () => {
    expect(shouldFocusSearch({ key: '/', target: { tagName: 'BODY' } })).toBe(true);
    expect(shouldFocusSearch({ key: '/', target: { tagName: 'BUTTON' } })).toBe(true);
    expect(shouldFocusSearch({ key: '/', target: { tagName: 'INPUT', type: 'search' } })).toBe(false);
    expect(shouldFocusSearch({ key: '/', target: { tagName: 'TEXTAREA' } })).toBe(false);
    expect(shouldFocusSearch({ key: '/', target: { tagName: 'DIV', isContentEditable: true } })).toBe(false);
    expect(shouldFocusSearch({ key: '/', target: { tagName: 'BODY' }, metaKey: true })).toBe(false);
    expect(shouldFocusSearch({ key: '/', target: null, isComposing: true })).toBe(false);
    expect(shouldFocusSearch({ key: '/', target: null, defaultPrevented: true })).toBe(false);
    expect(shouldFocusSearch({ key: 'a', target: { tagName: 'BODY' } })).toBe(false);
  });
  it('treats checkbox-like inputs as not typing', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('grid arrow keys', () => {
  it('moves by one and by a row, and leaves the grid upwards', () => {
    expect(gridMove(0, 'ArrowRight', 3, 6)).toBe(1);
    expect(gridMove(5, 'ArrowRight', 3, 6)).toBe(5);
    expect(gridMove(1, 'ArrowDown', 3, 6)).toBe(4);
    expect(gridMove(4, 'ArrowDown', 3, 6)).toBe(4);
    expect(gridMove(4, 'ArrowUp', 3, 6)).toBe(1);
    expect(gridMove(1, 'ArrowUp', 3, 6)).toBe(-1);
    expect(gridMove(1, 'Enter', 3, 6)).toBeNull();
  });
});

describe('typed query to precomputed example', () => {
  const ex = ['on off switch for a setting', 'pick a date range', 'pill toggle for filters'];
  it('matches exact, prefix and word-subset queries', () => {
    expect(matchExample('Pick a date range!', ex)).toBe(1);
    expect(matchExample('on off', ex)).toBe(0);
    expect(matchExample('toggle pill', ex)).toBe(2);
    expect(matchExample('xy', ex)).toBe(-1);
    expect(matchExample('carousel of images', ex)).toBe(-1);
    expect(matchExample('  ', ex)).toBe(-1);
  });
});

describe('humanized Storybook names', () => {
  const item = (title: string, label: string, category = title.split('/')[1]!): Item =>
    ({ id: label, label, title, category, description: '', tags: [], src: '' });
  it('derives readable component and story names', () => {
    expect(splitCamel('AILabel')).toBe('AI Label');
    expect(splitCamel('useFocusTrap')).toBe('useFocusTrap');
    expect(componentName(item('Components/Fluid Components/FluidDropdown', 'Fluid Components · Default'))).toBe('Fluid Dropdown');
    expect(componentName(item('Components/DataTable/WithAILabel', 'DataTable · Column AI Label Sort'))).toBe('Data Table');
    expect(storyName(item('Components/DataTable/Sorting', 'DataTable · Default'))).toBe('Sorting');
    expect(componentName(item('Preview/preview__Card', 'preview__Card · With AI Label'))).toBe('Card');
    expect(componentName(item('Components/ToggleSwitch/Features', 'ToggleSwitch · Disabled'))).toBe('Toggle Switch');
    expect(storyName(item('Components/ToggleSwitch/Features', 'ToggleSwitch · Disabled'))).toBe('Disabled');
    expect(componentName({ id: 'x', label: 'Pill Tabs', category: 'Tabs', description: '', tags: [], src: '' })).toBe('Pill Tabs');
  });
});

describe('system eval schema', () => {
  const modes = { fusion: { top1: 11, top3: 15, n: 22 }, text: { top1: 10, top3: 14, n: 22 }, image: { top1: 8, top3: 14, n: 22 } };
  it('reads the old schema', () => {
    const r = systemEvalSummary('primer', { systems: { primer: { stories: 333, components: 64, modes } } });
    expect(r?.fusion).toEqual({ top1: 11, top3: 15, n: 22 });
    expect(r?.noneN).toBeUndefined();
    expect(r?.cutoff).toBeUndefined();
  });
  it('reads the new schema and its cutoff', () => {
    const data = { systems: { carbon: { stories: 359, components: 80, cutoff: 0.71, dev: {}, test: { modes, noneFlagged: 2, noneN: 4, realFlagged: 1 } } } };
    const r = systemEvalSummary('carbon', data);
    expect(r).toMatchObject({ cutoff: 0.71, noneFlagged: 2, noneN: 4, realFlagged: 1, image: { top1: 8 } });
    expect(systemEvalSummary('nope', data)).toBeNull();
    expect(systemEvalSummary('carbon', null)).toBeNull();
  });
  it('uses only the examples.json cutoff for labels', () => {
    expect(systemCutoff('carbon', { cutoff: 0.69 })).toBe(0.69);
    expect(systemCutoff('carbon', { cutoff: 'x' })).toBeUndefined();
    expect(systemCutoff('carbon')).toBeUndefined();
  });
});


describe('live operation serialization', () => {
  it('keeps library selection and ranking together, and recovers after errors', async () => {
    const { serializeLive } = await import('./live');
    const events: string[] = [];
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const first = serializeLive(async () => {
      events.push('carbon');
      await barrier;
      events.push('rank carbon');
      throw new Error('failed');
    });
    const failed = expect(first).rejects.toThrow('failed');
    const second = serializeLive(async () => { events.push('primer'); });
    await Promise.resolve();
    expect(events).toEqual(['carbon']);
    release();
    await failed;
    await second;
    expect(events).toEqual(['carbon', 'rank carbon', 'primer']);
  });
});
