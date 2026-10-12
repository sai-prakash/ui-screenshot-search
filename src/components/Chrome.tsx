import { useEffect, useState } from 'react';
import { detectWebGPU, type EmbedderProgress } from '../lib/embedder';

const CASE_STUDY = 'https://saiprakash.design/work/multimodal-design-qa';

export function Header(props: { title: string; line: string; repo: string }) {
  return (
    <header className="hdr">
      <div>
        <h1>{props.title}</h1>
        <p className="lede">{props.line}</p>
      </div>
      <nav className="hdr-links">
        <a href={CASE_STUDY}>Case study</a>
        <a href={`https://github.com/sai-prakash/${props.repo}`}>GitHub</a>
      </nav>
    </header>
  );
}

export function PrivacyNote() {
  return (
    <p className="privacy">
      <strong>Privacy:</strong> nothing you type or upload leaves your browser. The examples are
      precomputed; the live model runs on your device and there is no server.
    </p>
  );
}

// Measured transfer sizes for model files (text model + vision encoder + tokenizer), audio skipped.
const SIZE_CPU = 'about 560 MB';
const SIZE_GPU = 'about 290 MB';

export type LiveState =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: EmbedderProgress | null; step?: string }
  | { kind: 'ready'; device: string }
  | { kind: 'error'; message: string };

export function LivePanel(props: {
  state: LiveState;
  onStart: () => void;
  readyText: string;
}) {
  const [gpu, setGpu] = useState<boolean | null>(null);
  useEffect(() => {
    void detectWebGPU().then(setGpu);
  }, []);
  const size = gpu ? SIZE_GPU : SIZE_CPU;
  const s = props.state;
  return (
    <section className="live" aria-live="polite">
      {s.kind === 'idle' && (
        <>
          <button className="btn primary" onClick={props.onStart} data-testid="run-live">
            Run the model in your browser ({size}, one-time)
          </button>
          <p className="muted small">
            {gpu === false
              ? "No GPU found, so it will run on your CPU. It's slower but it works."
              : 'Uses your GPU if available. Cached by your browser for next time.'}
          </p>
        </>
      )}
      {s.kind === 'loading' && (
        <div>
          <p>
            {s.step ??
              (s.progress && s.progress.total
                ? `Downloading the model… ${Math.round((s.progress.loaded / 1e6))} of ${Math.round(s.progress.total / 1e6)} MB`
                : 'Starting the model…')}
          </p>
          <div className="bar">
            <span
              style={{
                width: `${s.progress && s.progress.total ? (100 * s.progress.loaded) / s.progress.total : 3}%`,
              }}
            />
          </div>
        </div>
      )}
      {s.kind === 'ready' && (
        <p className="ok" data-testid="live-ready">
          Model running in your browser ({s.device}). {props.readyText}
        </p>
      )}
      {s.kind === 'error' && (
        <div className="err" role="alert">
          <p>{s.message}</p>
          <button className="btn" onClick={() => location.reload()}>
            Reload and try again
          </button>
        </div>
      )}
    </section>
  );
}

export function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
