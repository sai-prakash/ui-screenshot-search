import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { EvalSection, Footer, HowItWorks, LiveStrip, ModelPrompt, TopBar } from './components/Chrome';
import { liveError, serializeLive, useAutoResume, useGpu, type LiveState } from './components/live';
import { SearchBar } from './components/SearchBar';
import { SystemTabs } from './components/SystemTabs';
import { ResultCard, SkeletonCard, type Surface } from './components/ResultCard';
import { Drawer, type DrawerData } from './components/Drawer';
import { Library } from './components/Library';
import { handleGridKeys, matchExample, shouldFocusSearch } from './components/keys';
import { friendlyError } from './lib/errors';
import { isNoMatch, matchLabel, type MatchContext } from './lib/matchStrength';
import { validateUpload } from './lib/uploads';
import { SAMPLES } from './lib/samples';
import { sampleById, type Hit } from './lib/library';
import {
  SYSTEMS, fetchJson, systemCutoff, systemEvalSummary,
  type Item, type SystemExamples, type SystemId, type SystemManifest,
} from './lib/systems';

import examplesData from './data/examples.json';

// Model code (Transformers.js + ONNX Runtime) loads only when you opt in.
const live = () => import('./lib/search');

const SEARCH_DEBOUNCE_MS = 320;
const EXAMPLES = examplesData.examples;
// Seven so the sample keeps its deliberate no-match example ("pick a date range").
const MAX_CHIPS = 7;
const RESULTS_PANEL = 'results-panel';

type View = { source: 'example' | 'live'; input: 'text' | 'image'; label: string; hits: Hit[] } | null;
type Example = { query: string; results: { id: string; score: number }[] };
type Lib = { id: SystemId; items: Item[]; examples: Example[]; cutoff?: number; manifest?: SystemManifest };

const SAMPLE_LIB: Lib = { id: 'sample', items: SAMPLES, examples: EXAMPLES };

function exampleHits(lib: Lib, i: number): Hit[] {
  const byId = new Map(lib.items.map((it) => [it.id, it]));
  return lib.examples[i]!.results
    .map((r) => ({ item: lib.id === 'sample' ? sampleById(r.id) : byId.get(r.id)!, score: r.score }))
    .filter((h) => h.item);
}

const exampleView = (lib: Lib, i: number): View =>
  ({ source: 'example', input: 'text', label: lib.examples[i]!.query, hits: exampleHits(lib, i) });

const systemName = (id: SystemId) => SYSTEMS.find((s) => s.id === id)!.name;
const surfaceFor = (id: SystemId): Surface => (id === 'sample' ? 'dark' : 'light');

/** Story counts for the tabs before a system has been fetched, from the measured eval file. */
const INITIAL_COUNTS: Partial<Record<SystemId, number>> = { sample: SAMPLES.length };
for (const s of SYSTEMS) {
  const n = s.id === 'sample' ? undefined : systemEvalSummary(s.id)?.stories;
  if (n !== undefined) INITIAL_COUNTS[s.id] = n;
}

export default function App() {
  const [liveState, setLive] = useState<LiveState>({ kind: 'idle' });
  const gpu = useGpu();
  const [lib, setLib] = useState<Lib>(SAMPLE_LIB);
  const libRef = useRef<Lib>(SAMPLE_LIB);
  const libCache = useRef(new Map<SystemId, Lib>([['sample', SAMPLE_LIB]]));
  const [counts, setCounts] = useState(INITIAL_COUNTS);
  const [switching, setSwitching] = useState<SystemId | null>(null);
  const [active, setActive] = useState(0);
  const [view, setView] = useState<View>(() => exampleView(SAMPLE_LIB, 0));
  const [query, setQuery] = useState('');
  const queryRef = useRef('');
  const inputVersion = useRef(0);
  // Text that came from an example chip; the live model doesn't need to re-run it.
  const exampleText = useRef<string | null>(null);
  const [needModel, setNeedModel] = useState<'text' | 'image' | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerData | null>(null);
  const gen = useRef(0);
  const switchGen = useRef(0);
  const startingLive = useRef(false);
  const pendingImage = useRef<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const ready = liveState.kind === 'ready';

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const showExample = (l: Lib, i: number) => {
    ++gen.current;
    pendingImage.current = null;
    setBusy(false);
    setSearchErr(null);
    setNeedModel(null);
    setImageUrl(null);
    setActive(i);
    ++inputVersion.current;
    queryRef.current = l.examples[i]!.query;
    exampleText.current = l.examples[i]!.query;
    setQuery(l.examples[i]!.query);
    setView(exampleView(l, i));
  };

  const pickSystem = async (id: SystemId) => {
    if (id === libRef.current.id && !switching) return;
    const request = ++switchGen.current;
    const inputAtStart = inputVersion.current;
    ++gen.current;
    setBusy(false);
    setNeedModel(null);
    pendingImage.current = null;
    setSearchErr(null);
    setSwitching(id);
    try {
      const next: Lib = libCache.current.get(id) ?? await (async () => {
        const [manifest, ex] = await Promise.all([
          fetchJson<SystemManifest>(`/systems/${id}/manifest.json`),
          fetchJson<SystemExamples>(`/systems/${id}/examples.json`),
        ]);
        return { id, items: manifest.items, examples: ex.examples, cutoff: systemCutoff(id, ex), manifest };
      })();
      libCache.current.set(id, next);
      if (request !== switchGen.current) return;
      libRef.current = next;
      setLib(next);
      setCounts((c) => ({ ...c, [id]: next.items.length }));
      if (inputAtStart === inputVersion.current) showExample(next, 0);
      else { setView(null); onQueryChange(queryRef.current); }
    } catch {
      if (request === switchGen.current) setSearchErr(`Could not load ${systemName(id)}. Check your connection and select it again.`);
    } finally {
      if (request === switchGen.current) setSwitching(null);
    }
  };

  const startLive = async () => {
    if (startingLive.current || ready) return;
    startingLive.current = true;
    setLive({ kind: 'loading', progress: null });
    try {
      setLive({ kind: 'loading', progress: null, step: 'Loading the model code…' });
      const info = await serializeLive(async () => {
        const { loadEmbedder } = await live();
        return loadEmbedder((p) => setLive({ kind: 'loading', progress: p }));
      });
      setLive({ kind: 'ready', device: info.device === 'webgpu' ? 'GPU' : 'CPU' });
    } catch (err) {
      setLive(liveError(err));
    } finally {
      startingLive.current = false;
    }
  };
  useAutoResume(() => void startLive());

  const runText = useCallback(async (q: string) => {
    if (!q.trim()) return;
    const g = ++gen.current;
    const library = libRef.current;
    setBusy(true);
    setSearchErr(null);
    try {
      const hits = await serializeLive(async () => {
        if (g !== gen.current) return [];
        const model = await live();
        await model.loadLibrary(library.id, library.items);
        return model.searchByText(q);
      });
      if (g !== gen.current) return;
      setActive(-1);
      setNeedModel(null);
      setImageUrl(null);
      setView({ source: 'live', input: 'text', label: q, hits });
    } catch (err) {
      if (g === gen.current) setSearchErr(friendlyError(err));
    } finally {
      if (g === gen.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || switching || !query.trim() || query === exampleText.current) return;
    setBusy(true);
    const scheduledGeneration = gen.current;
    const h = window.setTimeout(() => {
      if (scheduledGeneration === gen.current) void runText(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(h);
  }, [query, ready, switching, runText]);

  const runImage = useCallback(async (blob: Blob) => {
    // Validate even in instant mode, and retain the upload until opt-in finishes.
    try { validateUpload(blob); }
    catch (err) { setSearchErr(friendlyError(err)); return; }
    const g = ++gen.current;
    exampleText.current = null;
    ++inputVersion.current;
    queryRef.current = '';
    setQuery('');
    setActive(-1);
    setSearchErr(null);
    setImageUrl(null);
    setBusy(false);
    if (!ready) {
      pendingImage.current = blob;
      setView(null);
      setNeedModel('image');
      return;
    }
    pendingImage.current = null;
    const library = libRef.current;
    setBusy(true);
    setNeedModel(null);
    let url: string | null = null;
    try {
      const hits = await serializeLive(async () => {
        if (g !== gen.current) return [];
        const model = await live();
        await model.loadLibrary(library.id, library.items);
        return model.searchByImage(blob);
      });
      if (g !== gen.current) return;
      url = URL.createObjectURL(blob);
      setImageUrl(url);
      setView({ source: 'live', input: 'image', label: 'your screenshot', hits });
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      if (g === gen.current) setSearchErr(friendlyError(err));
    } finally {
      if (g === gen.current) setBusy(false);
    }
  }, [ready]);

  useEffect(() => {
    if (ready && !switching && pendingImage.current) void runImage(pendingImage.current);
  }, [ready, switching, runImage]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (f && !drawer && !switching) { e.preventDefault(); void runImage(f); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [runImage, drawer, switching]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (drawer || !shouldFocusSearch(e)) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const onQueryChange = (v: string) => {
    ++inputVersion.current;
    queryRef.current = v;
    ++gen.current;
    exampleText.current = null;
    pendingImage.current = null;
    setImageUrl(null);
    setNeedModel(null);
    setActive(-1);
    setBusy(false);
    setSearchErr(null);
    setQuery(v);
    if (!v.trim()) {
      setNeedModel(null);
      setActive(-1);
      setView(null);
      return;
    }
    if (ready) { setBusy(Boolean(v.trim())); return; } // the debounced effect runs the live search
    const currentLib = libRef.current;
    const i = matchExample(v, currentLib.examples.map((e) => e.query));
    if (i >= 0) {
      setActive(i);
      setNeedModel(null);
      setImageUrl(null);
      setView(exampleView(currentLib, i));
    } else {
      setActive(-1);
      setView(null);
      setNeedModel('text');
    }
  };

  const clearQuery = () => {
    onQueryChange('');
    searchRef.current?.focus();
  };

  const focusFirstCard = () => resultsRef.current?.querySelector<HTMLElement>('[data-card]')?.focus();

  const name = systemName(lib.id);
  const surface = surfaceFor(lib.id);
  const ctx: MatchContext = { system: lib.id, input: view?.input ?? 'text', cutoff: lib.cutoff };
  const shown = view?.hits.slice(0, lib.id === 'sample' ? 3 : 6) ?? [];
  const noMatch = isNoMatch(shown[0]?.score, ctx);
  const loading = switching !== null || busy;
  const credit = lib.manifest
    ? `Screenshot from the public ${lib.manifest.name} Storybook (${lib.manifest.license}), captured ${lib.manifest.indexedAt.slice(0, 10)}.`
    : 'Synthetic sample component drawn for this demo (Apache-2.0).';

  const open = (item: Item, opener: HTMLElement, score?: number) => setDrawer({
    item, score, label: score === undefined ? undefined : matchLabel(score, ctx), systemName: name, surface, credit, opener,
  });

  const showPrompt = needModel !== null && !ready;
  const chips = lib.examples.slice(0, MAX_CHIPS);

  return (
    <div className="app">
      <TopBar live={liveState} />
      <main className="page">
        <section className="hero">
          <h1>Find a UI component by describing it</h1>
          <p className="lede">Plain words or a screenshot, matched against real design-system screenshots.</p>
          <SearchBar
            ref={searchRef}
            value={query}
            busy={busy}
            onChange={onQueryChange}
            onClear={clearQuery}
            uploadDisabled={switching !== null}
            onUpload={() => fileRef.current?.click()}
            onArrowDown={focusFirstCard}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && !drawer && !switching) { e.preventDefault(); void runImage(f); }
              e.target.value = '';
            }}
          />
          <p className="privacy">Searches stay in your browser. Model files download only after you opt in.</p>

          <div className="controls">
            <SystemTabs systems={SYSTEMS} active={lib.id} pending={switching} counts={counts} panelId={RESULTS_PANEL}
              onPick={(id) => void pickSystem(id)} />
            <div className="chips" data-testid="examples" aria-label="Example searches">
              {chips.map((ex, i) => (
                <button key={ex.query} className="chip" disabled={switching !== null} aria-pressed={active === i} onClick={() => showExample(lib, i)}>
                  {ex.query}
                </button>
              ))}
            </div>
          </div>
        </section>
        <div className="live-wrap">
          <LiveStrip state={liveState} gpu={gpu} onStart={() => void startLive()} />
        </div>

        <section id={RESULTS_PANEL} className="results-section" role="tabpanel" aria-labelledby={`tab-${switching ?? lib.id}`} aria-busy={loading}>
          {searchErr && <p className="err-banner" role="alert">{searchErr}</p>}

          {showPrompt && !switching ? (
            <ModelPrompt state={liveState} gpu={gpu} onStart={() => void startLive()} input={needModel} />
          ) : loading ? (
            <>
              <div className="results-head"><span className="skel-line w40" /><span className="sr-only">Loading results…</span></div>
              <div className="results-grid" data-testid="results-loading">
                {Array.from({ length: (switching ?? lib.id) === 'sample' ? 3 : 6 }, (_, i) => <SkeletonCard key={i} />)}
              </div>
            </>
          ) : view && shown.length > 0 ? (
            <div aria-live="polite">
              <div className="results-head">
                <h2>
                  {imageUrl && view.input === 'image' && <img className="query-thumb" src={imageUrl} alt="" width={28} height={28} />}
                  {noMatch ? 'Closest to' : 'Top matches for'} <span className="q">“{view.label}”</span>
                </h2>
                <span className="source">{view.source === 'example' ? 'Precomputed · instant' : 'Computed in your browser'}</span>
              </div>
              {noMatch && (
                <p className="no-match" data-testid="no-match">
                  Nothing in {lib.id === 'sample' ? 'the sample library' : name} clearly matches — closest results below.
                </p>
              )}
              <div
                ref={resultsRef}
                className={`results-grid${noMatch ? ' faded' : ''}`}
                data-testid="results"
                onKeyDown={(e) => handleGridKeys(e, () => searchRef.current?.focus())}
              >
                {shown.map((h) => (
                  <ResultCard key={h.item.id} item={h.item} systemName={name} surface={surface}
                    label={matchLabel(h.score, ctx)} onOpen={(el) => open(h.item, el, h.score)} />
                ))}
              </div>
              {view.source === 'example' && lib.id === 'sample' && view.label === 'pick a date range' && (
                <p className="note">There is no date picker in the sample on purpose, so this example should come back as no match.</p>
              )}
              {view.input === 'image' && (
                <p className="note">Match labels are tuned on text searches, so screenshot results are shown as closest only.</p>
              )}
            </div>
          ) : (
            <div className="empty" data-testid="empty">
              <h3>Search {lib.id === 'sample' ? 'the sample library' : name}</h3>
              <p className="muted">Describe what it does or how it looks, pick an example above, or paste a screenshot.</p>
            </div>
          )}
        </section>

        <Library key={lib.id} items={lib.items} noun={lib.id === 'sample' ? 'components' : 'stories'} systemName={name}
          surface={surface} onOpen={(item, el) => open(item, el)} />

        <div className="info-row">
          <HowItWorks />
          <EvalSection system={lib.id} systemName={name} components={SAMPLES.length} />
        </div>
        {lib.manifest && (
          <p className="note source-note">
            {lib.manifest.items.length} stories from the public <a href={lib.manifest.source}>{lib.manifest.name} Storybook</a>{' '}
            ({lib.manifest.license}), captured {lib.manifest.indexedAt.slice(0, 10)}. Capped per component; docs pages and
            duplicates skipped.
          </p>
        )}
        <Footer />
      </main>
      {drawer && <Drawer key={drawer.item.id} data={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}
