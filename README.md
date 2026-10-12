# UI Search

**Multimodal design-system screenshot search that runs entirely in your browser.**

Type a query or paste/upload an image crop — EmbeddingGemma 2 (via Transformers.js + WebGPU) embeds locally and ranks a built-in library of UI component screenshots by cosine similarity. After the first model download, the tab works offline. No server-side embeddings.

## Live demo

https://ui-screenshot-search.vercel.app

> **Demo GIF:** drop a short screen recording at `docs/demo.gif` (or record one from the live site) and replace this note with `![UI Search demo](docs/demo.gif)`.

## Stack

React · TypeScript · Vite · Transformers.js · WebGPU · EmbeddingGemma 2

## Model

| Field | Value |
| --- | --- |
| **Model id** | [`onnx-community/embeddinggemma-2-ONNX`](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX) |
| **Task** | Multimodal feature extraction (text + image) |
| **Preferred device** | `webgpu` + `dtype: "q4f16"` |
| **Fallback** | `wasm` + `dtype: "q8"` |
| **Encoders loaded** | Text + vision (audio encoder disabled to shrink download) |

EmbeddingGemma 2 is natively multimodal, so text queries and image crops share one embedding space. Document texts use the retrieval prefix `title: … \| text: …`; queries use `task: search result \| query: …`.

The model ID is defined in `src/lib/model.ts` and shared by browser inference and build scripts. Changing models also requires regenerating the library embeddings and examples; text-only models cannot support screenshot search.

## Features

- Dark, pixel-clean UI titled **UI Search**
- First-load progress for model download + local indexing of ~19 sample components
- Text search → top-k results with cosine similarity scores
- Image upload / clipboard paste → same search over screenshot embeddings
- Privacy note: embeddings never leave the tab after download
- Stack chips in the hero

## Run locally

```bash
npm install
npm run dev
```

Then open the printed localhost URL (WebGPU works best in Chrome / Edge).

```bash
npm run build
npm run preview
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview the production build |

## Deploy

This repo is set up for **Vercel** (static Vite output). COOP/COEP headers in `vercel.json` enable `SharedArrayBuffer` / WASM threads where available.

```bash
npx vercel --prod
```

Or connect `sai-prakash/ui-screenshot-search` in the Vercel dashboard.

GitHub Pages works too via any static-site Action that publishes `dist/` after `npm run build`.

## Portfolio / Built card

Suggested 2-line copy for [saiprakash.design](https://saiprakash.design):

> **UI Search** — Multimodal design-system screenshot search in the browser.
> EmbeddingGemma 2 + Transformers.js + WebGPU; text or image crop → ranked components, fully on-device.

## License

Apache-2.0 (compatible with EmbeddingGemma 2’s Apache-2.0 release).

Sample SVG placeholders in `/public/samples/` are original to this repo.

## Instant mode and CPU fallback (Oct 2026)

- The page opens with real, precomputed example results (`src/data/examples.json`, plus library embeddings in `public/` where used). They were produced by running the same model (q8) in Node with `scripts/precompute.mjs`; rerun it after changing samples: `npm i --no-save sharp && node scripts/precompute.mjs`.
- The live model is opt-in. The app checks for a real WebGPU adapter first. Without one it goes straight to WASM + q8 and points ONNX Runtime at the plain CPU WASM binary in `public/ort/`, because the WebGPU build bundled with Transformers.js has no CPU kernel for `GatherBlockQuantized`, which every quantized EmbeddingGemma 2 file uses.

## Engineering checks and evaluation

Run `npm test`, `npx tsc -b`, and `npx vite build` for the local checks.
Run `npm run eval -- --offline` to evaluate with cached model files only, or
`npm run eval` when model downloads are available. The evaluator reuses
`public/library-embeddings.json` and writes measured results to `src/data/eval.json`.
It reports top-1, top-3, and MRR for text-only, image-only, and fusion scoring on
separate dev and held-out test queries. Here “image-only” means text queries ranked
against library image embeddings; this is not an uploaded-screenshot benchmark.
The acceptance threshold is selected only on dev queries. The existing weak band
is a display policy, not a measured confidence interval. `matchStrength` exposes
these boundaries without importing the model runtime.

TODO (orchestrator): verify actual browser GPU warm-up failure, CPU reload-and-resume, and upload decoding on target devices. The unit tests mock the runtime; they do not measure device performance.
