import type { SampleComponent } from './samples';
import type { PackedVector } from './packed';

export type SystemId = 'sample' | 'carbon' | 'primer';
export type SystemInfo = { id: SystemId; name: string; license?: string; home?: string };

export const SYSTEMS: SystemInfo[] = [
  { id: 'sample', name: 'Sample (20)' },
  { id: 'carbon', name: 'IBM Carbon', license: 'Apache-2.0', home: 'https://github.com/carbon-design-system/carbon' },
  { id: 'primer', name: 'GitHub Primer', license: 'MIT', home: 'https://github.com/primer/react' },
];

export type SystemManifest = {
  id: string; name: string; source: string; license: string; indexedAt: string;
  stats: { candidates: number; components: number; picked: number; kept: number; duplicates: number; failed: number };
  items: SampleComponent[];
};
export type SystemExamples = { examples: { query: string; results: { id: string; score: number }[] }[] };
export type PackedLibrary = { library: { id: string; text: PackedVector; image: PackedVector }[] };

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed (${res.status})`);
  return (await res.json()) as T;
}
