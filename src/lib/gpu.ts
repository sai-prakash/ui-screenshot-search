/** True only when a real WebGPU adapter exists (navigator.gpu alone is not enough). No model code here, so it's safe in the main bundle. */
export async function detectWebGPU(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

export const FORCE_WASM_KEY = 'demo.forceWasm';
export const AUTO_RESUME_KEY = 'demo.autoResume';
/** Testing hook: ?simulateGpuFail pretends a GPU exists and fails, to exercise the CPU fallback. */
export const SIMULATE_GPU_FAIL =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('simulateGpuFail');
