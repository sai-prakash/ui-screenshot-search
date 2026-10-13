import type { SampleComponent } from './samples';
import type { PackedVector } from './packed';
import systemEval from '../data/system-eval.json';

export type SystemId = 'sample' | 'carbon' | 'primer';
export type SystemInfo = { id: SystemId; name: string; license?: string; home?: string };

export const SYSTEMS: SystemInfo[] = [
  { id: 'sample', name: 'Sample' },
  { id: 'carbon', name: 'IBM Carbon', license: 'Apache-2.0', home: 'https://github.com/carbon-design-system/carbon' },
  { id: 'primer', name: 'GitHub Primer', license: 'MIT', home: 'https://github.com/primer/react' },
];

/** A library item; indexed Storybook items also carry their title path and, sometimes, an interaction state. */
export type Item = SampleComponent & { title?: string; state?: string };

export type SystemManifest = {
  id: string; name: string; source: string; license: string; indexedAt: string;
  stats: { candidates: number; components: number; picked: number; kept: number; duplicates: number; failed: number };
  items: Item[];
};
export type SystemExamples = { cutoff?: number; examples: { query: string; results: { id: string; score: number }[] }[] };
export type PackedLibrary = { library: { id: string; text: PackedVector; image: PackedVector }[] };

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed (${res.status})`);
  return (await res.json()) as T;
}

// Storybook title segments that group stories rather than name a component.
const GENERIC = new Set(['components', 'features', 'examples', 'feature flag', 'feature flags', 'responsive variants', 'interactions', 'events']);

/** "DataTable" -> "Data Table", "AILabel" -> "AI Label". Leaves hooks and phrases alone. */
export function splitCamel(s: string): string {
  if (/\s/.test(s) || /^use[A-Z]/.test(s)) return s;
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

const clean = (s: string) => s.replace(/^preview_+/i, '');

function titleParts(item: Item): { name: string; extra: string[] } | null {
  if (!item.title) return null;
  const segs = item.title.split('/').slice(1).filter((s) => !GENERIC.has(s.toLowerCase()));
  if (!segs.length) return null;
  let at = 0;
  const next = segs[1];
  // Groups like "Fluid Components/FluidDropdown" or "Skeleton/SkeletonText": the next segment is the component.
  if (next && (/\s/.test(segs[0]!) || (/^[A-Za-z_]+$/.test(next) && /[a-z][A-Z]/.test(next) && !/^With/.test(next)))) at = 1;
  return { name: segs[at]!, extra: segs.slice(at + 1) };
}

/** Human-readable component name for a library item. */
export function componentName(item: Item): string {
  if (!item.title) return item.label;
  const parts = titleParts(item);
  return splitCamel(clean(parts ? parts.name : item.category));
}

/** Human-readable story name ("Sorting", "With AI Label"), or '' for sample items. */
export function storyName(item: Item): string {
  if (!item.title) return '';
  const story = item.label.split(' · ').slice(1).join(' · ');
  const extra = (titleParts(item)?.extra ?? []).map((s) => splitCamel(clean(s)));
  const parts = [...extra];
  if (story && !(story === 'Default' && extra.length)) parts.push(splitCamel(story));
  return parts.join(' · ');
}

type Rates = { top1: number; top3: number; n: number };
type Modes = Partial<Record<'text' | 'image' | 'fusion', Rates>>;
type RawSystemEval = {
  stories?: number; components?: number; cutoff?: number; modes?: Modes;
  test?: { modes?: Modes; noneFlagged?: number; noneN?: number; realFlagged?: number };
};

export type SystemEvalSummary = {
  stories?: number; components?: number; cutoff?: number;
  fusion: Rates; text?: Rates; image?: Rates;
  noneFlagged?: number; noneN?: number; realFlagged?: number;
};

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Counts are shown as "x of n"; accept rates too, in case a schema stores them that way. */
function asCounts(r: Rates | undefined): Rates | undefined {
  if (!r || !num(r.top1) || !num(r.top3) || !num(r.n)) return undefined;
  const rates = r.top1 <= 1 && r.top3 <= 1 && (!Number.isInteger(r.top1) || !Number.isInteger(r.top3));
  return rates ? { n: r.n, top1: Math.round(r.top1 * r.n), top3: Math.round(r.top3 * r.n) } : r;
}

/** Read src/data/system-eval.json for one system; handles both the old (modes at top) and new (test.modes) schema. */
export function systemEvalSummary(id: string, data: unknown = systemEval): SystemEvalSummary | null {
  const r = (data as { systems?: Record<string, RawSystemEval> } | null)?.systems?.[id];
  if (!r) return null;
  const modes = r.test?.modes ?? r.modes;
  const fusion = asCounts(modes?.fusion);
  if (!fusion) return null;
  return {
    stories: num(r.stories) ? r.stories : undefined,
    components: num(r.components) ? r.components : undefined,
    cutoff: num(r.cutoff) ? r.cutoff : undefined,
    fusion,
    text: asCounts(modes?.text),
    image: asCounts(modes?.image),
    noneFlagged: num(r.test?.noneFlagged) ? r.test.noneFlagged : undefined,
    noneN: num(r.test?.noneN) ? r.test.noneN : undefined,
    realFlagged: num(r.test?.realFlagged) ? r.test.realFlagged : undefined,
  };
}

/** Labels use the cutoff shipped with the precomputed examples. */
export function systemCutoff(_id: string, examples?: { cutoff?: unknown } | null): number | undefined {
  if (num(examples?.cutoff)) return examples.cutoff;
  return undefined;
}
