# UI Search

Find a design-system component by describing it in plain words or pasting a screenshot. The model runs in your browser; there is no backend.

Live demo: https://ui-screenshot-search.vercel.app

> **Demo GIF: TODO**

## What it does

- **Instant examples, no download.** The page opens with seven example queries whose results were precomputed at build time with the same model (`src/data/examples.json`). Nothing model-related is downloaded until you click "Run the model in your browser".
- **Live text search (opt-in).** Type a description and the app embeds it in your browser, then ranks the 19 library components by similarity. It shows the top 3.
- **Live screenshot search (opt-in).** Upload or paste an image (up to 10 MB; resized so the longest side is at most 2048 px). It is compared with the library's image embeddings.
- **Match labels.** Each text result is labelled **Strong**, **Weak** or **No match**, with the raw cosine similarity as small secondary text. If the top result isn't Strong, the results area says plainly that nothing in the library fits well and shows the closest items faded out. Image results show similarity only, because the cutoff was tuned on text queries.
- **"How well it works" note** under the library, showing the held-out numbers from `src/data/eval.json`.

## How it works

- **Model:** [`onnx-community/embeddinggemma-2-ONNX`](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX) via Transformers.js. Text and images share one embedding space. The audio encoder is skipped. The model ID lives in one place, `src/lib/model.ts`, shared by the app and the build scripts.
- **Library embeddings are precomputed.** `scripts/precompute.mjs` runs the model (q8, CPU) in Node over the 19 sample SVGs in `public/samples/` and writes `public/library-embeddings.json` and `src/data/examples.json`. Live mode fetches that file and only embeds your query; it does not index anything in the browser.
- **Scoring:** for text queries, each component gets `max(textSimilarity, 0.95 × imageSimilarity)` against its description and its rendered image (`src/lib/scoring.ts`). The 0.95 weight was not tuned. Image queries use image similarity only.
- **Device choice:** the app checks for a real WebGPU adapter. With one, it runs on the GPU with `q4f16` weights. Without one, it uses WASM on the CPU with `q8` weights and points ONNX Runtime at a plain CPU WASM build self-hosted in `public/ort/` (the WebGPU build bundled with Transformers.js has no CPU kernel for `GatherBlockQuantized`, which the quantized EmbeddingGemma 2 files use). If the GPU fails while loading or warming up, the page reloads once into CPU mode and resumes automatically.
- **Lazy loading:** Transformers.js and ONNX Runtime are loaded with a dynamic `import()` only when you opt in, so the first page load stays small.
- **Repeat visits:** Transformers.js stores the model files in the browser's Cache API, so a second visit skips the download (checked with a persistent Chromium profile: zero model requests on the second load). There is no service worker, so the page itself still needs a network connection to load.

## How well it works

Measured with `npm run eval`, which writes `src/data/eval.json`. Queries are in `scripts/eval-queries.json` and were written before running the model on them. They are split into a **dev** set (10 queries with a correct answer, 4 with none), used only to pick the no-match cutoff, and a **test** set (19 with a correct answer, 7 with none), which is what's reported here. Scores come from the q8 model on CPU in Node.

Held-out test set, text queries against the 19-component library:

| Scoring | Top-1 | Top-3 | MRR |
| --- | --- | --- | --- |
| Fusion (what the app uses) | 18 / 19 (0.95) | 19 / 19 (1.00) | 0.97 |
| Text description only | 17 / 19 (0.89) | 17 / 19 (0.89) | 0.92 |
| Rendered image only | 12 / 19 (0.63) | 16 / 19 (0.84) | 0.76 |

"Rendered image only" means text queries ranked against the library's image embeddings. It is **not** a benchmark of uploaded screenshots; that path has no measured numbers yet.

No-match detection (cutoff 0.6375, chosen on dev, where it flagged 4 of 4 no-match queries and 0 of 10 real ones):

- 3 of 7 test queries with no matching component were correctly flagged ("line chart over time", "pricing plans comparison", "breadcrumb trail").
- 4 slipped through as Strong: "date picker calendar", "drag and drop file upload", "chat message bubbles" and "slider to choose a value".
- 0 of 19 real test queries were wrongly flagged.

The Weak band (0.04 below the cutoff) is a display choice, not a measured interval. In the precomputed examples, "pick a date range" (there's no date picker in the library) tops out at 0.6263, so it is labelled Weak and the UI shows the no-strong-match message.

**Caveats.** The library is 19 small synthetic SVGs made for this demo, and the test set is only 26 queries, so a single query changes the results noticeably. The cutoff was picked on just 14 dev queries and catches fewer than half of the test no-match queries. The library's scores sit in a narrow band, so treat these numbers as a sanity check, not a benchmark. The browser's GPU path uses `q4f16` weights while all of these numbers come from `q8`; parity between the two hasn't been measured.

## Privacy

What you type or upload is embedded on your device and never sent anywhere. The page does make normal network requests: model files from Hugging Face (only after you opt in), the library embeddings file from this site, and the Inter font from Google Fonts.

## Run locally

```bash
npm install
npm run dev
```

Open the printed localhost URL. WebGPU works best in Chrome or Edge; other browsers fall back to the CPU.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests (Vitest). The model runtime is mocked. |
| `npm run lint` | oxlint |
| `npm run eval` | Re-run the held-out evaluation and rewrite `src/data/eval.json`. Add `-- --offline` to use cached model files only. |
| `npm i --no-save sharp && node scripts/precompute.mjs` | Re-embed the library and examples after changing samples |

CI (`.github/workflows/ci.yml`) runs `tsc -b`, `vitest run` and `vite build` on every push and pull request.

## Known gaps

- Screenshot search has no measured accuracy yet, and the library images are rendered by `sharp` at build time, which may draw fonts differently from your browser.
- The fusion weight (0.95) is a guess.
- Inference runs on the main thread, and the GPU-to-CPU fallback covers model loading and warm-up, not errors during a search.
- Device performance (load time, query latency) hasn't been measured on real hardware.

## Deploy

Static Vite output, set up for Vercel. `vercel.json` sets COOP/COEP headers so WASM threads can use `SharedArrayBuffer`.

```bash
npx vercel --prod
```

## License

Apache-2.0, matching EmbeddingGemma 2's license. The sample SVGs in `public/samples/` are original to this repo.
