import { SAMPLES, type SampleComponent } from './samples';

export type Hit = { item: SampleComponent; score: number };
export const byId = new Map(SAMPLES.map((s) => [s.id, s]));
export const sampleById = (id: string) => byId.get(id)!;
