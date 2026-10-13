import { useEffect, useState } from 'react';
import { detectWebGPU, AUTO_RESUME_KEY } from '../lib/gpu';
import { friendlyError, GpuFailedError } from '../lib/errors';

export type EmbedderProgress = { file?: string; loaded: number; total: number };

export type LiveState =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: EmbedderProgress | null; step?: string }
  | { kind: 'ready'; device: string }
  | { kind: 'error'; message: string };

/** If the page just reloaded itself into CPU mode, start the live model again automatically. */
export function useAutoResume(start: () => void) {
  useEffect(() => {
    if (sessionStorage.getItem(AUTO_RESUME_KEY) === '1') {
      sessionStorage.removeItem(AUTO_RESUME_KEY);
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Map a live-load failure to UI state; a GPU failure reloads once into CPU mode. */
export function liveError(err: unknown): LiveState {
  console.error(err);
  if (err instanceof GpuFailedError) {
    window.setTimeout(() => location.reload(), 1200);
    return { kind: 'loading', progress: null, step: friendlyError(err) };
  }
  return { kind: 'error', message: friendlyError(err) };
}

/** null while checking, then whether a real WebGPU adapter exists. */
export function useGpu(): boolean | null {
  const [gpu, setGpu] = useState<boolean | null>(null);
  useEffect(() => {
    void detectWebGPU().then(setGpu);
  }, []);
  return gpu;
}

// Measured transfer sizes for model files (text model + vision encoder + tokenizer), audio skipped.
export const SIZE_CPU = 'about 560 MB';
export const SIZE_GPU = 'about 290 MB';
export const modelSize = (gpu: boolean | null) => (gpu ? SIZE_GPU : SIZE_CPU);

export function progressText(s: Extract<LiveState, { kind: 'loading' }>): string {
  return s.step ??
    (s.progress && s.progress.total
      ? `Downloading the model… ${Math.round(s.progress.loaded / 1e6)} of ${Math.round(s.progress.total / 1e6)} MB`
      : 'Starting the model…');
}

export const progressPct = (s: Extract<LiveState, { kind: 'loading' }>) =>
  s.progress && s.progress.total ? Math.min(100, Math.max(0, (100 * s.progress.loaded) / s.progress.total)) : 3;

// The model ranks against a mutable current library. Keep loading and ranking
// together so a system switch cannot change the library mid-embedding.
let liveQueue: Promise<unknown> = Promise.resolve();
export function serializeLive<T>(task: () => Promise<T>): Promise<T> {
  const result = liveQueue.then(task);
  liveQueue = result.catch(() => undefined);
  return result;
}
