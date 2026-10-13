import { useEffect, useState } from 'react';
import { detectWebGPU, AUTO_RESUME_KEY } from '../lib/gpu';
import { friendlyError, GpuFailedError } from '../lib/errors';
import { matchStrength } from '../lib/matchStrength';
import systemEval from '../data/system-eval.json';
import { evalSummary, STRONG_FROM, WEAK_FROM } from '../lib/evalSummary';

export type EmbedderProgress = { file?: string; loaded: number; total: number };

/** If the page just reloaded itself into CPU mode, start the live model again automatically. */
export function useAutoResume(start: () => void) {
  useEffect(() => {
    if (sessionStorage.getItem(AUTO_RESUME_KEY) === '1') {
      sessionStorage.removeItem(AUTO_RESUME_KEY);
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Map a live-load failure to UI state; a GPU failure reloads once into CPU mode. */
export function liveError(err: unknown): LiveState {
  console.error(err);
  if (err instanceof GpuFailedError) {
    window.setTimeout(() => location.reload(), 1200);
    return { kind: 'loading', progress: null, step: friendlyError(err) };
  }
  return { kind: 'error', message: friendlyError(err) };
}

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

const STRENGTH_LABEL = { strong: 'Strong', weak: 'Weak', none: 'No match' } as const;

/** Per-result label. `calibrated` is false for image searches: the threshold was tuned on text queries. */
export function ResultScore(props: { score: number; calibrated: boolean }) {
  const strength = matchStrength(props.score);
  return (
    <div className="result-score">
      {props.calibrated && <span className={`strength ${strength}`}>{STRENGTH_LABEL[strength]}</span>}
      <span
        className="similarity"
        title="Cosine similarity between your query and this component. Higher is closer; it is not a probability."
      >
        similarity {props.score.toFixed(2)}
      </span>
    </div>
  );
}

export function EvalNote(props: { components: number }) {
  const s = evalSummary();
  return (
    <section className="eval-note" aria-labelledby="eval-title">
      <h2 id="eval-title">How well it works</h2>
      <p>
        On {s.n} held-out test queries (written before running the model), the right component came
        first {s.fusion.top1} of {s.n} times and was in the top 3 {s.fusion.top3} of {s.n} times.
        Matching on the text descriptions alone (no images) scored {s.text.top1} and {s.text.top3}.
        Of {s.noMatchQueries} test queries that have no matching component, {s.noMatchFlagged} were
        correctly flagged as no strong match;{' '}
        {s.realWronglyFlagged === 0 ? 'no' : s.realWronglyFlagged} real queries were wrongly flagged.
      </p>
      <p className="muted">
        Measured on {props.components} synthetic sample components, so treat it as a sanity check, not a
        benchmark. Labels: Strong from similarity {STRONG_FROM.toFixed(2)}, Weak from{' '}
        {WEAK_FROM.toFixed(2)}, No match below that. The cutoff was picked on a separate set of dev
        queries and only applies to text searches.
      </p>
    </section>
  );
}

type SysModes = Record<'text' | 'image' | 'fusion', { top1: number; top3: number; n: number }>;
export function SystemEvalNote(props: { id: string }) {
  const r = (systemEval.systems as Record<string, { stories: number; components: number; modes: SysModes }>)[props.id];
  if (!r) return null;
  const f = r.modes.fusion;
  return (
    <section className="eval-note" aria-labelledby="eval-title">
      <h2 id="eval-title">How well it works on this system</h2>
      <p>
        On {f.n} plain-language queries written before indexing, a story from the right component came first{' '}
        {f.top1} of {f.n} times and was in the top 3 {f.top3} of {f.n} times. Text only: {r.modes.text.top1} and{' '}
        {r.modes.text.top3}. Screenshot only: {r.modes.image.top1} and {r.modes.image.top3}.
      </p>
      <p className="muted">
        {r.stories} stories across {r.components} components. A small hand-written query set, so read it as a
        sanity check, not a benchmark. Text matching sees the Storybook title and story name.
      </p>
    </section>
  );
}
