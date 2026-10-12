/** WebGPU failed after the runtime initialised; the page reloads itself into CPU mode. */
export class GpuFailedError extends Error {
  constructor() {
    super('gpu-failed');
  }
}

/** Plain-language message for any load/search failure. */
export function friendlyError(err: unknown): string {
  if (err instanceof GpuFailedError || (err instanceof Error && err.message === 'gpu-failed')) {
    return "Your graphics chip couldn't run the model. Switching to the CPU…";
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch|network|Failed to load|NetworkError/i.test(msg)) {
    return 'The model download was interrupted. Check your connection and try again.';
  }
  if (/memory|allocation|OOM|Aborted/i.test(msg)) {
    return 'Your browser ran out of memory loading the model. Close a few tabs and try again, or stick with the examples.';
  }
  if (msg === 'empty-image') return 'That image was empty. Paste or upload a PNG, JPEG, WebP or SVG.';
  return "The model couldn't load in this browser. The examples above still work.";
}
