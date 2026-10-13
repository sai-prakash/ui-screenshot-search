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

## Real design systems: IBM Carbon and GitHub Primer

Tabs at the top switch between the 19-item **Sample**, **IBM Carbon** and **GitHub Primer**. The real systems were indexed from their public Storybooks with `scripts/index-storybook.mjs`, which works on any public Storybook (v7+ `index.json` or v6 `stories.json`).

| System | Storybook | Candidates | Picked (max 6 per component) | Kept after dedupe | Components | Overlays captured open | Non-visual excluded |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IBM Carbon | https://react.carbondesignsystem.com | 483 | 347 | 311 | 88 | 37 | 6 |
| GitHub Primer | https://primer.style/react/storybook | 776 | 307 | 264 | 58 | 3 | 31 |

### How well it works (fresh held-out queries)

`node scripts/eval-systems.mjs carbon primer` writes `src/data/system-eval.json`.

- **Dev set** (`scripts/system-eval-queries.json`, the original 22 queries per system, plus 6 no-match queries per system in `scripts/system-eval-dev-none.json`) is used **only** to pick each system's no-match cutoff (Youden's J on the top fusion score).
- **Test set** (`scripts/system-eval-heldout.json`): 22 new answerable queries + 6 no-match queries per system, written and committed (9add02a) **before** the indexing fixes were re-run. Nothing was tuned on it.

Held-out test, fusion scoring, before vs after the indexing fixes (the "before" row is the previous index scored on the same held-out queries):

| System | Index | Top-1 | Top-3 | No-match queries flagged | Real queries wrongly flagged |
| --- | --- | --- | --- | --- | --- |
| IBM Carbon | before | 13 / 22 | 18 / 22 | 6 / 6 | 3 / 22 |
| IBM Carbon | after | 16 / 22 | 18 / 22 | 5 / 6 | 2 / 22 |
| GitHub Primer | before | 11 / 22 | 16 / 22 | 4 / 6 | 1 / 22 |
| GitHub Primer | after | 14 / 22 | 17 / 22 | 2 / 6 | 0 / 22 |

Cutoffs (calibrated on dev): Carbon 0.6793, Primer 0.6497. In the UI a result at or above the cutoff is labelled "Good match", up to 0.03 below it "Weak match" (a display band, not measured), lower "Unlikely"; if the top result is below the cutoff the page says nothing clearly matches.

What changed in the index: component names come from the first non-grouping title segment (so Carbon "Fluid Components/FluidDropdown" is `FluidDropdown`, Primer "Private/Components/Overlay" is `Overlay`); React hooks (`use*`, `Hooks/…`) and providers/id helpers are excluded; for menus, tooltips, popovers, dropdowns and comboboxes the indexer prefers stories named open/expanded, then tries `args=open:!true`, then hovers/clicks the first trigger, and keeps the open render; story text now includes the humanized component name.

Caveats: 22 + 6 queries per system is a sanity check, not a benchmark; one query moves top-1 by 4.5 points. Part of the Carbon gain is that queries for fluid inputs can now be credited to `FluidX` components, which the old naming hid. Primer no-match detection on held-out queries is weak (2 of 6). The Primer open-state capture only worked for 3 overlays (its overlays mostly need app state that the default story doesn't expose).

### Index any public Storybook

```bash
npm i --no-save sharp playwright-core        # needs a Chrome/Chromium binary (default /usr/bin/google-chrome)
node scripts/index-storybook.mjs --url https://react.carbondesignsystem.com \
  --id carbon --name "IBM Carbon" --license Apache-2.0 --max 400 --per-component 6
node scripts/eval-systems.mjs carbon          # optional: needs queries in scripts/system-eval-queries.json
```

What it does:

1. Reads `<url>/index.json` (or `stories.json`), drops docs entries and titles matching deprecated / experimental / playground / test / overview.
2. Picks stories round-robin across components so one big component can't eat the cap.
3. Opens each `iframe.html?id=<story>` in headless Chrome (1024×720, reduced motion), trims whitespace, saves a WebP thumbnail (max 480×360, q72) and drops perceptually identical renders.
4. Embeds each story's text (`title › story name`) and thumbnail with the same model and document format as the sample, and stores the vectors as int8 with a per-vector scale (`scripts/embed-system.mjs`).

Output goes to `public/systems/<id>/` (`manifest.json`, `embeddings.json`, `examples.json`, `thumbs/`). To show a new system in the UI, add it to `SYSTEMS` in `src/lib/systems.ts`. Indexing about 400 stories took roughly 20 minutes of screenshots and 10 minutes of CPU embedding on the build box.

Asset size: Carbon 3.0 MB (2.2 MB thumbnails, 0.76 MB embeddings, 0.15 MB manifest), Primer 2.6 MB (1.7 MB, 0.72 MB, 0.14 MB). Nothing is fetched until you pick a system, and embeddings only load in live mode.

### Credits and licenses

- Screenshots of **IBM Carbon** components come from the public [Carbon React Storybook](https://react.carbondesignsystem.com). Carbon is © IBM, [Apache-2.0](https://github.com/carbon-design-system/carbon/blob/main/LICENSE).
- Screenshots of **GitHub Primer** components come from the public [Primer React Storybook](https://primer.style/react/storybook). Primer is © GitHub, [MIT](https://github.com/primer/react/blob/main/LICENSE).
- Each result links back to its source story. This project is not affiliated with IBM or GitHub.

### Known gaps in the indexing

- Open-state capture is heuristic; most Primer overlays still render closed.
- Generic queries ("main call to action") still land on composite stories that contain buttons.

## Privacy

What you type or upload is embedded on your device and never sent anywhere. The page does make normal network requests: model files from Hugging Face (only after you opt in), and the library embeddings and screenshots from this site. No web fonts or third-party analytics are loaded.

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

Carbon and Primer screenshots in `public/systems/` keep their upstream licenses (Apache-2.0 and MIT, see above).


Apache-2.0, matching EmbeddingGemma 2's license. The sample SVGs in `public/samples/` are original to this repo.
