import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ inference: vi.fn(), config: vi.fn(), processor: vi.fn(), model: vi.fn(),
  env: { backends: { onnx: { wasm: {} as { wasmPaths?: { mjs: string; wasm: string } } } } } }));
vi.mock('@huggingface/transformers', () => ({
  AutoConfig: { from_pretrained: mocks.config },
  AutoProcessor: { from_pretrained: mocks.processor },
  AutoModel: { from_pretrained: mocks.model },
  env: mocks.env,
}));
vi.mock('./image', () => ({ loadImageForEmbedding: vi.fn() }));
vi.mock('./gpu', () => ({ detectWebGPU: async () => true, FORCE_WASM_KEY: 'cpu', AUTO_RESUME_KEY: 'resume', SIMULATE_GPU_FAIL: false }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const flags = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => flags.get(key) ?? null,
    setItem: (key: string, value: string) => flags.set(key, value) });
  vi.stubGlobal('location', { href: 'http://localhost/' });
  mocks.config.mockResolvedValue({});
  mocks.processor.mockResolvedValue(vi.fn(async () => ({})));
  mocks.model.mockResolvedValue(mocks.inference);
  mocks.env.backends.onnx.wasm = {};
});

it('flags reload and auto-resume when the first GPU inference fails', async () => {
  mocks.inference.mockRejectedValueOnce(new Error('GPU kernel failed'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { loadEmbedder } = await import('./embedder');
  await expect(loadEmbedder()).rejects.toThrow('gpu-failed');
  expect(sessionStorage.getItem('cpu')).toBe('1');
  expect(sessionStorage.getItem('resume')).toBe('1');
  expect(mocks.inference).toHaveBeenCalledOnce();
  warn.mockRestore();
});

it('keeps CPU WASM paths and warms up before reporting ready', async () => {
  sessionStorage.setItem('cpu', '1');
  mocks.inference.mockResolvedValue({ sentence_embedding: { data: new Float32Array([1]), dims: [1, 1] } });
  const { loadEmbedder } = await import('./embedder');
  await expect(loadEmbedder()).resolves.toEqual({ device: 'wasm', dtype: 'q8' });
  expect(mocks.env.backends.onnx.wasm.wasmPaths).toEqual({
    mjs: 'http://localhost/ort/ort-wasm-simd-threaded.mjs',
    wasm: 'http://localhost/ort/ort-wasm-simd-threaded.wasm',
  });
  expect(mocks.model).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ device: 'wasm', dtype: 'q8' }));
  expect(mocks.inference).toHaveBeenCalledOnce();
});
