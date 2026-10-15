import { evalSummary, STRONG_FROM, WEAK_FROM } from '../lib/evalSummary';
import { systemEvalSummary } from '../lib/systems';
import { MODEL_ID } from '../lib/model';
import { modelSize, progressPct, progressText, type LiveState } from './live';

const CASE_STUDY = 'https://saiprakash.design/work/multimodal-design-qa';
const REPO = 'https://github.com/sai-prakash/ui-screenshot-search';

export function TopBar(props: { live: LiveState }) {
  const s = props.live;
  return (
    <header className="topbar">
      <a className="wordmark" href="/" aria-label="UI Search home">
        <span className="wordmark-dot" aria-hidden="true" />UI Search
      </a>
      <div className="topbar-right">
        {s.kind === 'ready' && <span className="status-pill"><span className="dot ok" aria-hidden="true" />Model on {s.device}</span>}
        <nav className="topbar-links" aria-label="Project">
          <a href={CASE_STUDY}>Case study</a>
          <a href={REPO}>GitHub</a>
        </nav>
      </div>
    </header>
  );
}

function Progress(props: { state: Extract<LiveState, { kind: 'loading' }> }) {
  return (
    <div className="progress">
      <p>{progressText(props.state)}</p>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-label="Model download" aria-valuenow={props.state.progress?.total ? Math.round(progressPct(props.state)) : undefined}>
        <span style={{ transform: `scaleX(${progressPct(props.state) / 100})` }} />
      </div>
    </div>
  );
}

/** The opt-in strip: examples are precomputed; the model only downloads when you ask. */
export function LiveStrip(props: { state: LiveState; gpu: boolean | null; onStart: () => void }) {
  const s = props.state;
  return (
    <section className={`live live-${s.kind}`} aria-live="polite">
      {s.kind === 'idle' && (
        <>
          <p className="live-copy">
            <span className="live-title">Examples are precomputed. No model download until you opt in.</span>
            <span className="muted">
              {props.gpu === false
                ? "No GPU found, so it will run on your CPU. It's slower but it works."
                : 'Uses your GPU if available. Cached by your browser for next time.'}
            </span>
          </p>
          <button className="btn primary" onClick={props.onStart} data-testid="run-live">
            Run the model in your browser ({modelSize(props.gpu)}, one-time)
          </button>
        </>
      )}
      {s.kind === 'loading' && <Progress state={s} />}
      {s.kind === 'ready' && (
        <p className="live-copy ok" data-testid="live-ready">
          <span className="live-title"><span className="dot ok" aria-hidden="true" /> Model running in your browser ({s.device}). Type your own search or paste a screenshot.</span>
        </p>
      )}
      {s.kind === 'error' && (
        <div className="err" role="alert">
          <p>{s.message}</p>
          <button className="btn" onClick={() => location.reload()}>Reload and try again</button>
        </div>
      )}
    </section>
  );
}

/** Shown in the results area when you type or paste before the model is loaded. */
export function ModelPrompt(props: { state: LiveState; gpu: boolean | null; onStart: () => void; input: 'text' | 'image' }) {
  const s = props.state;
  return (
    <div className="prompt" data-testid="needs-model">
      <h3>{props.input === 'image' ? 'Screenshot search' : 'Live search'} needs the in-browser model</h3>
      {s.kind === 'loading' ? (
        <>
          <p className="muted">Your search will run as soon as it's ready.</p>
          <Progress state={s} />
        </>
      ) : s.kind === 'error' ? (
        <p className="err-text">{s.message}</p>
      ) : (
        <>
          <p className="muted">
            It runs on your device, so nothing you type leaves the browser. Or pick one of the precomputed examples above.
          </p>
          <button className="btn primary" onClick={props.onStart}>
            Run the model in your browser ({modelSize(props.gpu)}, one-time)
          </button>
        </>
      )}
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="info" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <ol className="steps">
        <li><span>1</span>Every screenshot and its text label were embedded ahead of time with EmbeddingGemma 2.</li>
        <li><span>2</span>Your words or screenshot are embedded on your device by the same model.</li>
        <li><span>3</span>Results are ranked by similarity, and a cutoff flags when nothing really fits.</li>
      </ol>
    </section>
  );
}

function Stat(props: { value: string; label: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{props.value}</span>
      <span className="stat-label">{props.label}</span>
    </div>
  );
}

export function EvalSection(props: { system: string; systemName: string; components: number }) {
  if (props.system === 'sample') {
    const s = evalSummary();
    return (
      <section className="info" aria-labelledby="eval-title">
        <h2 id="eval-title">How well it works</h2>
        <div className="stats">
          <Stat value={`${s.fusion.top1} of ${s.n}`} label="right component ranked first" />
          <Stat value={`${s.fusion.top3} of ${s.n}`} label="in the top 3" />
          <Stat value={`${s.noMatchFlagged} of ${s.noMatchQueries}`} label="no-match queries flagged" />
        </div>
        <p className="muted small">
          {s.n} held-out test queries, written before running the model. Text descriptions alone: {s.text.top1} first,{' '}
          {s.text.top3} in the top 3. {s.realWronglyFlagged === 0 ? 'No' : s.realWronglyFlagged} real queries were wrongly
          flagged. Measured on {props.components} synthetic sample components, so it's a sanity check, not a benchmark.
          Strong from similarity {STRONG_FROM.toFixed(2)}, Weak from {WEAK_FROM.toFixed(2)}, tuned on separate dev queries
          for text searches.
        </p>
      </section>
    );
  }
  const r = systemEvalSummary(props.system);
  if (!r) return null;
  const f = r.fusion;
  return (
    <section className="info" aria-labelledby="eval-title">
      <h2 id="eval-title">How well it works on {props.systemName}</h2>
      <div className="stats">
        <Stat value={`${f.top1} of ${f.n}`} label="right component ranked first" />
        <Stat value={`${f.top3} of ${f.n}`} label="in the top 3" />
        {r.noneN !== undefined && r.noneFlagged !== undefined && (
          <Stat value={`${r.noneFlagged} of ${r.noneN}`} label="no-match queries flagged" />
        )}
      </div>
      <p className="muted small">
        {f.n} held-out plain-language queries.
        {r.text && ` Text only: ${r.text.top1} first, ${r.text.top3} in the top 3.`}
        {r.image && ` Screenshot only: ${r.image.top1} first, ${r.image.top3} in the top 3.`}
        {r.realFlagged !== undefined && ` ${r.realFlagged === 0 ? 'No' : r.realFlagged} real queries were wrongly flagged.`}
        {r.stories !== undefined && r.components !== undefined && ` ${r.stories} stories across ${r.components} components.`}
        {' '}A small hand-written query set, so read it as a sanity check, not a benchmark.
        {r.cutoff !== undefined && ` Good match from similarity ${r.cutoff.toFixed(2)}.`}
      </p>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      Model: {MODEL_ID} via Transformers.js. Apache-2.0. Carbon screenshots © IBM (Apache-2.0), Primer screenshots ©
      GitHub (MIT). Not affiliated with IBM or GitHub.
    </footer>
  );
}
