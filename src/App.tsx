import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import './App.css';
import {
  MODEL_ID,
  getDeviceInfo,
  loadEmbedder,
  type EmbedderProgress,
} from './lib/embedder';
import { SAMPLES } from './lib/samples';
import {
  buildIndex,
  searchByImageBlob,
  searchByText,
  type SearchHit,
} from './lib/search';

type Phase = 'boot' | 'model' | 'index' | 'ready' | 'error';

const SEARCH_DEBOUNCE_MS = 320;

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function libraryHits(): SearchHit[] {
  return SAMPLES.map((s) => ({
    ...s,
    score: 0,
    match: 'text' as const,
  }));
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [progress, setProgress] = useState<EmbedderProgress | null>(null);
  const [indexProgress, setIndexProgress] = useState({
    done: 0,
    total: SAMPLES.length,
    label: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const booted = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  const searchGen = useRef(0);

  const setHitsTransition = useCallback((next: SearchHit[]) => {
    startTransition(() => {
      setHits(next);
    });
  }, []);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    (async () => {
      try {
        setPhase('model');
        // Yield once so the boot/model chrome paints before heavy work.
        await new Promise<void>((r) => setTimeout(r, 0));
        const info = await loadEmbedder((p) => {
          // Throttle progress state updates to avoid main-thread thrash.
          setProgress(p);
        });
        setDeviceLabel(`${info.device} · ${info.dtype}`);
        setPhase('index');
        await buildIndex((done, total, label) => {
          setIndexProgress({ done, total, label });
        });
        setPhase('ready');
        setHitsTransition(libraryHits());
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();
  }, [setHitsTransition]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const progressPct = useMemo(() => {
    if (phase === 'model') {
      return Math.min(100, Math.max(0, progress?.progress ?? 0));
    }
    if (phase === 'index') {
      return (indexProgress.done / Math.max(1, indexProgress.total)) * 100;
    }
    return phase === 'ready' ? 100 : 0;
  }, [phase, progress, indexProgress]);

  const runTextSearch = useCallback(
    async (value: string) => {
      const q = value.trim();
      const gen = ++searchGen.current;
      if (!q) {
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }
        setImagePreview(null);
        setHitsTransition(libraryHits());
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }
        setImagePreview(null);
        const results = await searchByText(q, 8);
        if (gen !== searchGen.current) return;
        setHitsTransition(results);
        setError(null);
      } catch (err) {
        if (gen !== searchGen.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (gen === searchGen.current) setSearching(false);
      }
    },
    [setHitsTransition],
  );

  const runImageSearch = useCallback(
    async (file: Blob) => {
      const gen = ++searchGen.current;
      setSearching(true);
      try {
        if (!file || file.size === 0) {
          throw new Error('Empty image — nothing to search with');
        }
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        const url = URL.createObjectURL(file);
        previewUrlRef.current = url;
        setImagePreview(url);
        setQuery('');
        const results = await searchByImageBlob(file, 8);
        if (gen !== searchGen.current) return;
        setHitsTransition(results);
        setError(null);
      } catch (err) {
        if (gen !== searchGen.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (gen === searchGen.current) setSearching(false);
      }
    },
    [setHitsTransition],
  );

  // Debounced live text search once the index is ready.
  // Skip while an image query is active (cleared when the user types).
  useEffect(() => {
    if (phase !== 'ready') return;
    if (imagePreview) return;
    const handle = window.setTimeout(() => {
      void runTextSearch(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, phase, imagePreview, runTextSearch]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (phase !== 'ready') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void runImageSearch(file);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [phase, runImageSearch]);

  const statusText =
    phase === 'boot'
      ? 'Starting…'
      : phase === 'model'
        ? `Downloading ${MODEL_ID}`
        : phase === 'index'
          ? `Indexing ${indexProgress.label || 'components'} (${indexProgress.done}/${indexProgress.total})`
          : phase === 'ready'
            ? 'Ready'
            : 'Failed to load';

  const showScores = Boolean(hits && hits.some((h) => h.score > 0));
  const loading = phase !== 'ready' && phase !== 'error';
  const busy = searching || isPending;

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-top">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              runs locally in your tab
            </div>
            <h1>UI Search</h1>
            <p className="subtitle">
              Multimodal design-system search in your browser. Embeddings stay
              on-device after the first model download.
            </p>
          </div>
          <aside className="privacy">
            <strong>Privacy</strong>
            <div>
              No server embeddings. After the model caches in your browser,
              search works offline.
            </div>
          </aside>
        </div>
        <div className="chips">
          {['React', 'TypeScript', 'Transformers.js', 'WebGPU', 'EmbeddingGemma'].map(
            (chip) => (
              <span className="chip" key={chip}>
                {chip}
              </span>
            ),
          )}
        </div>
      </header>

      <section className="panel">
        <div className="search-row">
          <input
            className="search-input"
            value={query}
            disabled={phase !== 'ready'}
            placeholder="Search components — e.g. confirm modal, ghost button, empty state…"
            onChange={(e) => {
              const value = e.target.value;
              setQuery(value);
              if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current);
                previewUrlRef.current = null;
              }
              if (imagePreview) setImagePreview(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runTextSearch(query);
            }}
          />
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={phase !== 'ready' || busy || !query.trim()}
              onClick={() => void runTextSearch(query)}
            >
              {busy ? 'Searching…' : 'Search'}
            </button>
            <button
              className="btn"
              disabled={phase !== 'ready' || busy}
              onClick={() => fileRef.current?.click()}
            >
              Upload image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void runImageSearch(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <p className="hint">
          Tip: paste a screenshot crop with ⌘/Ctrl+V. Model: <code>{MODEL_ID}</code>
        </p>

        {loading && (
          <div className="status">
            <div className="status-title">
              <span>{statusText}</span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <div className="bar">
              <span style={{ width: `${progressPct}%` }} />
            </div>
            <div className="meta">
              {phase === 'model' && (
                <>
                  {progress?.file ? `${progress.file} · ` : ''}
                  {formatBytes(progress?.loaded)}
                  {progress?.total ? ` / ${formatBytes(progress.total)}` : ''}
                </>
              )}
              {phase === 'index' &&
                'Embedding text descriptions and sample screenshots locally…'}
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="status">
            <div className="status-title">
              <span style={{ color: 'var(--danger)' }}>Load failed</span>
            </div>
            <div className="meta">{error}</div>
          </div>
        )}

        {phase === 'ready' && error && (
          <div className="status">
            <div className="status-title">
              <span style={{ color: 'var(--danger)' }}>Search error</span>
            </div>
            <div className="meta">{error}</div>
          </div>
        )}

        {imagePreview && (
          <div className="preview-query">
            <img src={imagePreview} alt="Query crop" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Image query</div>
              <div className="meta">Matching against indexed component screenshots</div>
            </div>
          </div>
        )}
      </section>

      <div className="results-header">
        <h2>
          {loading
            ? 'Loading library…'
            : showScores
              ? 'Top matches'
              : 'Sample library'}
        </h2>
        <span>
          {deviceLabel
            ? `${SAMPLES.length} components · ${deviceLabel}`
            : `${SAMPLES.length} components`}
          {getDeviceInfo() ? '' : ''}
        </span>
      </div>

      {loading ? (
        <div className="grid" aria-busy="true" aria-label="Loading sample cards">
          {SAMPLES.map((s) => (
            <article className="card skeleton-card" key={s.id}>
              <div className="card-media skeleton-block" />
              <div className="card-body">
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
                <div className="skeleton-line medium" />
              </div>
            </article>
          ))}
        </div>
      ) : hits && hits.length > 0 ? (
        <div className={`grid${busy ? ' grid-pending' : ''}`}>
          {hits.map((hit) => (
            <article className="card" key={hit.id}>
              <div className="card-media">
                <img src={hit.src} alt={hit.label} loading="lazy" />
              </div>
              <div className="card-body">
                <div className="card-top">
                  <span className="category">{hit.category}</span>
                  {showScores && (
                    <span className="score">{(hit.score * 100).toFixed(1)}%</span>
                  )}
                </div>
                <h3 className="card-title">{hit.label}</h3>
                <p className="card-desc">{hit.description}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">No results yet. Try a text query or paste an image.</div>
      )}

      <footer className="footer">
        <span>
          Built for portfolio use · Apache-2.0 · embeddings via Transformers.js
        </span>
        <a href="https://github.com/sai-prakash/ui-screenshot-search" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
