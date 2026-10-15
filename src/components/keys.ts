type TargetLike = { tagName?: string; isContentEditable?: boolean; type?: string } | null | undefined;
type KeyLike = { key: string; target: unknown; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; isComposing?: boolean; defaultPrevented?: boolean };

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color', 'image']);

/** True when keystrokes are going into a text field. */
export function isTypingTarget(target: unknown): boolean {
  const t = target as TargetLike;
  if (!t || typeof t !== 'object') return false;
  if (t.isContentEditable) return true;
  const tag = (t.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !NON_TEXT_INPUTS.has((t.type ?? 'text').toLowerCase());
}

/** "/" focuses the search box, unless you're already typing somewhere or using a modifier. */
export function shouldFocusSearch(e: KeyLike): boolean {
  return !e.defaultPrevented && !e.isComposing && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target);
}

/**
 * Next card index for an arrow key in a grid with `cols` columns and `n` cards.
 * Returns -1 when moving up out of the first row, null for keys it doesn't handle.
 */
export function gridMove(i: number, key: string, cols: number, n: number): number | null {
  const c = Math.max(1, cols);
  switch (key) {
    case 'ArrowRight': return Math.min(n - 1, i + 1);
    case 'ArrowLeft': return Math.max(0, i - 1);
    case 'ArrowDown': return i + c < n ? i + c : i;
    case 'ArrowUp': return i - c >= 0 ? i - c : -1;
    case 'Home': return 0;
    case 'End': return n - 1;
    default: return null;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Index of the precomputed example a typed query corresponds to, or -1.
 * Matches exact text, a prefix of 3+ characters, or 2+ words that all start words of the example.
 */
export function matchExample(query: string, examples: string[]): number {
  const q = norm(query);
  if (!q) return -1;
  const ex = examples.map(norm);
  const exact = ex.indexOf(q);
  if (exact >= 0) return exact;
  if (q.length >= 3) {
    const prefix = ex.findIndex((e) => e.startsWith(q));
    if (prefix >= 0) return prefix;
  }
  const words = q.split(' ').filter((w) => w.length >= 2);
  if (words.length < 2) return -1;
  return ex.findIndex((e) => {
    const ew = e.split(' ');
    return words.every((w) => ew.some((x) => x.startsWith(w)));
  });
}

/** Arrow-key navigation between `[data-card]` elements inside a CSS grid container. */
export function handleGridKeys(e: { key: string; currentTarget: HTMLElement; preventDefault: () => void }, onUpOut?: () => void) {
  const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-card]'));
  const i = cards.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  const cols = getComputedStyle(e.currentTarget).gridTemplateColumns.split(' ').filter(Boolean).length;
  const j = gridMove(i, e.key, cols, cards.length);
  if (j === null) return;
  e.preventDefault();
  if (j < 0) onUpOut?.();
  else cards[j]!.focus();
}
