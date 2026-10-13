import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { EvalNote, SystemEvalNote, Header, LivePanel, PrivacyNote, ResultScore, liveError, useAutoResume, type LiveState } from './components/Chrome';
import { friendlyError } from './lib/errors';
import { matchStrength } from './lib/matchStrength';
import { validateUpload } from './lib/uploads';
import { MODEL_ID } from './lib/model';
import { SAMPLES } from './lib/samples';
import { sampleById, type Hit } from './lib/library';
import { SYSTEMS, fetchJson, type SystemExamples, type SystemId, type SystemManifest } from './lib/systems';
import type { SampleComponent } from './lib/samples';

import examplesData from './data/examples.json';

// Model code (Transformers.js + ONNX Runtime) loads only when you opt in.
const live = () => import('./lib/search');

const SEARCH_DEBOUNCE_MS = 320;
const EXAMPLES = examplesData.examples;

type View = { source: 'example' | 'live'; input: 'text' | 'image'; label: string; hits: Hit[] } | null;
type Example = { query: string; results: { id: string; score: number }[] };
type Lib = { id: SystemId; items: SampleComponent[]; examples: Example[]; manifest?: SystemManifest };

const SAMPLE_LIB: Lib = { id: 'sample', items: SAMPLES, examples: EXAMPLES };
const GRID_PAGE = 48;

function exampleHits(lib: Lib, i: number): Hit[] {
  const byId = new Map(lib.items.map((it) => [it.id, it]));
  return lib.examples[i]!.results
    .map((r) => ({ item: lib.id === 'sample' ? sampleById(r.id) : byId.get(r.id)!, score: r.score }))
    .filter((h) => h.item);
}

export default function App() {
  const [liveState, setLive] = useState<LiveState>({ kind: 'idle' });
  const [lib, setLib] = useState<Lib>(SAMPLE_LIB);
  const libRef = useRef<Lib>(SAMPLE_LIB);
  useEffect(() => { libRef.current = lib; }, [lib]);
  const [switching, setSwitching] = useState<SystemId | null>(null);
  const [gridLimit, setGridLimit] = useState(GRID_PAGE);
  const [active, setActive] = useState(0);
  const [view, setView] = useState<View>({ source: 'example', input: 'text', label: EXAMPLES[0]!.query, hits: exampleHits(SAMPLE_LIB, 0) });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const gen = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = liveState.kind === 'ready';

  const pickExample = (i: number) => {
    ++gen.current;
    setBusy(false);
    setSearchErr(null);
    setActive(i);
    setQuery('');
    setView({ source: 'example', input: 'text', label: lib.examples[i]!.query, hits: exampleHits(lib, i) });
  };

  const pickSystem = async (id: SystemId) => {
    if (id === lib.id || switching) return;
    ++gen.current;
    setSearchErr(null);
    setSwitching(id);
    try {
      const next: Lib = id === 'sample' ? SAMPLE_LIB : await (async () => {
        const [manifest, ex] = await Promise.all([
          fetchJson<SystemManifest>(`/systems/${id}/manifest.json`),
          fetchJson<SystemExamples>(`/systems/${id}/examples.json`),
        ]);
        return { id, items: manifest.items, examples: ex.examples, manifest };
      })();
      if (liveState.kind !== 'idle' && liveState.kind !== 'error') await (await live()).loadLibrary(id, next.items);
      setLib(next);
      setGridLimit(GRID_PAGE);
      setActive(0);
      setQuery('');
      setBusy(false);
      setView({ source: 'example', input: 'text', label: next.examples[0]!.query, hits: exampleHits(next, 0) });
    } catch (err) {
      setSearchErr(friendlyError(err));
    } finally {
      setSwitching(null);
    }
  };

  const startLive = async () => {
    setLive({ kind: 'loading', progress: null });
    try {
      setLive({ kind: 'loading', progress: null, step: 'Loading the model code…' });
      const { loadLibrary, loadEmbedder } = await live();
      await loadLibrary(libRef.current.id, libRef.current.items);
      const info = await loadEmbedder((p) => setLive({ kind: 'loading', progress: p }));
      setLive({ kind: 'ready', device: info.device === 'webgpu' ? 'GPU' : 'CPU' });
    } catch (err) {
      setLive(liveError(err));
    }
  };
  useAutoResume(() => void startLive());

  const runText = useCallback(async (q: string) => {
    if (!q.trim()) return;
    const g = ++gen.current;
    setBusy(true);
    setSearchErr(null);
    try {
      const hits = await (await live()).searchByText(q);
      if (g !== gen.current) return;
      setActive(-1);
      setSearchErr(null);
      setView({ source: 'live', input: 'text', label: q, hits });
    } catch (err) {
      if (g === gen.current) setSearchErr(friendlyError(err));
    } finally {
      if (g === gen.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !query.trim()) return;
    const scheduledGeneration = gen.current;
    const h = window.setTimeout(() => {
      if (scheduledGeneration === gen.current) void runText(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(h);
  }, [query, ready, runText]);

  const runImage = useCallback(async (blob: Blob) => {
    setQuery('');
    const g = ++gen.current;
    setBusy(true);
    setSearchErr(null);
    try {
      validateUpload(blob);
      const hits = await (await live()).searchByImage(blob);
      if (g !== gen.current) return;
      setActive(-1);
      setSearchErr(null);
      setView({ source: 'live', input: 'image', label: 'your image', hits });
    } catch (err) {
      if (g === gen.current) setSearchErr(friendlyError(err));
    } finally {
      if (g === gen.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!ready) return;
      const f = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (f) void runImage(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [ready, runImage]);

  // The threshold was tuned on text queries, so image searches get similarity only.
  // It was also tuned on the 20-item sample, so it is not applied to the indexed design systems.
  const calibrated = view?.input === 'text' && lib.id === 'sample';
  const topScore = view?.hits[0]?.score ?? -Infinity;
  const noStrongMatch = calibrated && matchStrength(topScore) !== 'strong';
  const topIds = new Set(noStrongMatch ? [] : view?.hits.slice(0, 3).map((h) => h.item.id));

  return (
    <div className="page">
      <Header
        title="UI Search"
        line="Find a design-system component by describing it in plain words or pasting a screenshot, for designers and engineers who don't know its name."
        repo="ui-screenshot-search"
      />
      <PrivacyNote />

      <h2 className="section-title">Design system</h2>
      <div className="chips" role="radiogroup" aria-label="Design system" data-testid="systems">
        {SYSTEMS.map((sys) => (
          <button key={sys.id} className="chip" role="radio" aria-checked={lib.id === sys.id}
            disabled={switching !== null} onClick={() => void pickSystem(sys.id)}>
            {sys.name}{switching === sys.id ? ' · loading…' : ''}
          </button>
        ))}
      </div>
      {lib.manifest && (
        <p className="note">
          {lib.manifest.items.length} stories from {new Set(lib.manifest.items.map((i) => i.category)).size} components, screenshotted from the
          public <a href={lib.manifest.source}>{lib.manifest.name} Storybook</a> ({lib.manifest.license}) on{' '}
          {lib.manifest.indexedAt.slice(0, 10)}. Capped per component, docs pages and duplicates skipped.
        </p>
      )}

      <h2 className="section-title">Try an example (instant, no download)</h2>
      <div className="chips" data-testid="examples">
        {lib.examples.map((ex, i) => (
          <button key={ex.query} className="chip" aria-pressed={active === i} onClick={() => pickExample(i)}>
            {ex.query}
          </button>
        ))}
      </div>

      <LivePanel state={liveState} onStart={startLive} readyText="Type your own search or paste a screenshot." />
      <div className="row">
        <input
          type="search"
          data-testid="query"
          aria-label="Describe a component"
          placeholder={ready ? 'Describe a component, e.g. "tabs for switching views"' : 'Load the model above to search your own words'}
          value={query}
          disabled={!ready}
          onChange={(e) => {
            ++gen.current;
            setBusy(false);
            setSearchErr(null);
            setQuery(e.target.value);
            if (!e.target.value.trim()) setView(null);
          }}
        />
        <button className="btn" disabled={!ready} onClick={() => fileRef.current?.click()}>
          Upload screenshot
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void runImage(f);
            e.target.value = '';
          }}
        />
      </div>
      {searchErr && <p className="err small" role="alert">{searchErr}</p>}

      {view && (
        <section aria-live="polite">
          <h2 className="section-title">
            {noStrongMatch ? 'Closest items' : 'Top matches'} for "{view.label}"{busy ? ' · searching…' : ''}
          </h2>
          {noStrongMatch && (
            <p className="no-match" data-testid="no-match">
              <strong>No strong match.</strong> Nothing in this library fits "{view.label}" well. Here are
              the closest items anyway, in case one is still useful.
            </p>
          )}
          <div className={`results${noStrongMatch ? ' faint' : ''}`} data-testid="results">
            {view.hits.slice(0, 3).map((h) => (
              <div className="result" key={h.item.id}>
                <img src={h.item.src} alt="" />
                <div>
                  <h3>{h.item.url ? <a href={h.item.url} target="_blank" rel="noreferrer">{h.item.label}</a> : h.item.label}</h3>
                  <p>{h.item.description}</p>
                </div>
                <ResultScore score={h.score} calibrated={calibrated} />
              </div>
            ))}
          </div>
          <p className="note">
            {view.source === 'example'
              ? lib.id === 'sample'
                ? 'Precomputed by running the same model on this library at build time. One example has no right answer on purpose: there is no date picker here, so "pick a date range" is flagged as no strong match.'
                : 'Precomputed by running the same model on this library at build time. These are the eval queries; the Strong/Weak cutoff was tuned on the sample, so scores here are raw similarity.'
              : 'Computed just now in your browser.'}
            {view.input === 'image' &&
              ' Strong / Weak labels are tuned for text searches, so image results show similarity only.'}
          </p>
        </section>
      )}

      <h2 className="section-title">The library ({lib.items.length} {lib.id === 'sample' ? 'components' : 'stories'})</h2>
      <div className="grid" data-testid="library">
        {lib.items.slice(0, gridLimit).map((s) => (
          <div className={`card${topIds.has(s.id) ? ' hit' : ''}`} key={s.id}>
            <img src={s.src} alt={s.label} loading="lazy" />
            <h3>{s.label}</h3>
            <p>{s.description}</p>
          </div>
        ))}
      </div>
      {lib.items.length > gridLimit && (
        <button className="btn" onClick={() => setGridLimit((n) => n + GRID_PAGE * 2)}>
          Show more ({lib.items.length - gridLimit} left)
        </button>
      )}

      {lib.id === 'sample' ? <EvalNote components={SAMPLES.length} /> : <SystemEvalNote id={lib.id} />}

      <footer>
        Model: {MODEL_ID} via Transformers.js. Apache-2.0.
      </footer>
    </div>
  );
}
