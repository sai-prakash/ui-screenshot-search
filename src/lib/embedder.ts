import {
  AutoConfig,
  AutoModel,
  AutoProcessor,
  env,
  type PreTrainedModel,
  type Processor,
  type ProgressCallback,
  type RawImage,
  type Tensor,
} from '@huggingface/transformers';
import { loadImageForEmbedding } from './image';

/** EmbeddingGemma 2 ONNX (multimodal: text + image; audio skipped). */
export const MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';

export type DeviceInfo = {
  device: 'webgpu' | 'wasm';
  dtype: 'q4f16' | 'q8';
};

export type EmbedderProgress = {
  file?: string;
  loaded: number;
  total: number;
};

const FORCE_WASM_KEY = 'demo.forceWasm';

let model: PreTrainedModel | null = null;
let processor: Processor | null = null;
let deviceInfo: DeviceInfo | null = null;
let loadPromise: Promise<DeviceInfo> | null = null;
let cpuBinaryConfigured = false;

/** True only when a real WebGPU adapter exists (navigator.gpu alone is not enough). */
export async function detectWebGPU(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

/**
 * Transformers.js ships the WebGPU build of ONNX Runtime Web. Its WASM binary
 * has no CPU kernel for GatherBlockQuantized, which every quantized
 * EmbeddingGemma 2 file uses, so CPU sessions fail. On machines without a
 * GPU, point ONNX Runtime at the plain CPU WASM binary (self-hosted in /ort)
 * before the first session is created.
 */
function useCpuWasmBinary() {
  if (cpuBinaryConfigured) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onnx = (env.backends as any).onnx;
  onnx.wasm ??= {};
  onnx.wasm.wasmPaths = {
    mjs: new URL('/ort/ort-wasm-simd-threaded.mjs', location.href).href,
    wasm: new URL('/ort/ort-wasm-simd-threaded.wasm', location.href).href,
  };
  cpuBinaryConfigured = true;
}

function makeProgress(onProgress?: (p: EmbedderProgress) => void): ProgressCallback {
  const files = new Map<string, { loaded: number; total: number }>();
  return ((data: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (!data.file) return;
    if (data.status === 'progress' && typeof data.total === 'number') {
      files.set(data.file, { loaded: data.loaded ?? 0, total: data.total });
    } else if (data.status === 'done') {
      const f = files.get(data.file);
      if (f) f.loaded = f.total;
    }
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    onProgress?.({ file: data.file, loaded, total });
  }) as ProgressCallback;
}

async function loadWith(
  device: 'webgpu' | 'wasm',
  dtype: 'q4f16' | 'q8',
  onProgress?: (p: EmbedderProgress) => void,
): Promise<DeviceInfo> {
  const progress_callback = makeProgress(onProgress);
  const config = await AutoConfig.from_pretrained(MODEL_ID);
  // Text + image only: skip the audio encoder files entirely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any).audio_config = null;
  processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
  // Same device + dtype for every model part (text model and vision encoder).
  model = await AutoModel.from_pretrained(MODEL_ID, {
    config,
    device,
    dtype,
    progress_callback,
  });
  deviceInfo = { device, dtype };
  return deviceInfo;
}

function reset() {
  loadPromise = null;
  model = null;
  processor = null;
  deviceInfo = null;
}

/**
 * Detect WebGPU first. GPU: WebGPU + q4f16. No GPU: WASM + q8 on the CPU
 * binary for every model part. If WebGPU fails mid-load we can't switch the
 * already-initialised runtime, so we ask for a reload into CPU mode.
 */
export async function loadEmbedder(
  onProgress?: (p: EmbedderProgress) => void,
): Promise<DeviceInfo> {
  if (deviceInfo && model && processor) return deviceInfo;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const forceWasm = sessionStorage.getItem(FORCE_WASM_KEY) === '1';
    const gpu = !forceWasm && (await detectWebGPU());
    if (gpu) {
      try {
        return await loadWith('webgpu', 'q4f16', onProgress);
      } catch (err) {
        console.warn('[embedder] WebGPU load failed', err);
        sessionStorage.setItem(FORCE_WASM_KEY, '1');
        throw new GpuFailedError();
      }
    }
    useCpuWasmBinary();
    return await loadWith('wasm', 'q8', onProgress);
  })();

  try {
    return await loadPromise;
  } catch (err) {
    reset();
    throw err;
  }
}

/** WebGPU failed after init; a reload will start in CPU mode. */
export class GpuFailedError extends Error {
  constructor() {
    super('gpu-failed');
  }
}

export function getDeviceInfo(): DeviceInfo | null {
  return deviceInfo;
}

async function embeddingFromInputs(
  text: string | string[] | null,
  images?: RawImage | RawImage[] | null,
): Promise<Float32Array> {
  if (!model || !processor) throw new Error('Embedder not loaded');
  const inputs = await processor(text, images ?? null);
  const out = await model(inputs);
  const emb = (out as { sentence_embedding: Tensor }).sentence_embedding;
  const data = emb.data as Float32Array;
  const dim = emb.dims[emb.dims.length - 1]!;
  return Float32Array.from(data.slice(0, dim));
}

export async function embedText(text: string): Promise<Float32Array> {
  return embeddingFromInputs(text);
}

export async function embedImageUrl(url: string): Promise<Float32Array> {
  return embeddingFromInputs(null, await loadImageForEmbedding(url));
}

export async function embedImageBlob(blob: Blob): Promise<Float32Array> {
  if (!blob || blob.size === 0) throw new Error('empty-image');
  return embeddingFromInputs(null, await loadImageForEmbedding(blob));
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Plain-language message for any load/search failure. */
export function friendlyError(err: unknown): string {
  if (err instanceof GpuFailedError) {
    return "Your graphics chip couldn't run the model. Reload and it will use the CPU instead (slower, but it works).";
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch|network|Failed to load|NetworkError/i.test(msg)) {
    return 'The model download was interrupted. Check your connection and try again.';
  }
  if (/memory|allocation|OOM|Aborted/i.test(msg)) {
    return "Your browser ran out of memory loading the model. Close a few tabs and try again, or stick with the examples.";
  }
  if (msg === 'empty-image') return 'That image was empty. Paste or upload a PNG, JPEG, WebP or SVG.';
  return "The model couldn't load in this browser. The examples above still work.";
}
