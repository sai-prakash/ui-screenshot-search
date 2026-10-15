import { useEffect, useRef } from 'react';
import { MatchBadge, Thumb, type Surface } from './ResultCard';
import { CloseIcon, ExternalIcon } from './icons';
import type { MatchLabel } from '../lib/matchStrength';
import { componentName, storyName, type Item } from '../lib/systems';

export type DrawerData = {
  item: Item;
  score?: number;
  label?: MatchLabel;
  systemName: string;
  surface: Surface;
  credit: string;
  opener: HTMLElement;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

export function Drawer(props: { data: DrawerData; onClose: () => void }) {
  const { item, score, label } = props.data;
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const onClose = useRef(props.onClose);
  useEffect(() => { onClose.current = props.onClose; });

  useEffect(() => {
    const opener = props.data.opener;
    const background = Array.from(panel.current?.closest('.app')?.children ?? [])
      .filter((el): el is HTMLElement => el instanceof HTMLElement && !el.classList.contains('drawer-root'));
    const previous = background.map((el) => el.inert);
    background.forEach((el) => { el.inert = true; });
    const keepFocus = (e: FocusEvent) => {
      if (e.target instanceof Node && !panel.current?.contains(e.target)) closeBtn.current?.focus();
    };
    document.addEventListener('focusin', keepFocus);
    closeBtn.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('focusin', keepFocus);
      background.forEach((el, i) => { el.inert = previous[i]!; });
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [props.data.opener]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose.current();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const els = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!els.length) return;
    const first = els[0]!, last = els[els.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const name = componentName(item);
  const story = storyName(item);
  return (
    <div className="drawer-root" onKeyDown={onKeyDown}>
      <div className="drawer-backdrop" onClick={() => onClose.current()} />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" ref={panel} data-testid="drawer">
        <div className="drawer-head">
          <div>
            <h2 id="drawer-title">{name}</h2>
            {story && <p className="drawer-story">{story}</p>}
          </div>
          <button ref={closeBtn} className="icon-btn" aria-label="Close details" onClick={() => onClose.current()}>
            <CloseIcon size={18} />
          </button>
        </div>
        <Thumb item={item} surface={props.data.surface} big />
        <dl className="drawer-facts">
          <div><dt>System</dt><dd>{props.data.systemName}</dd></div>
          {item.title ? (
            <div><dt>Storybook</dt><dd>{item.description}</dd></div>
          ) : (
            <div><dt>About</dt><dd>{item.description}</dd></div>
          )}
          {item.state === 'open' && <div><dt>State</dt><dd>Captured in its open state</dd></div>}
          {score !== undefined && (
            <div>
              <dt>Match</dt>
              <dd className="drawer-match">
                {label && <MatchBadge label={label} />}
                <span className="similarity" title="Cosine similarity between your query and this item. Higher is closer; it is not a probability.">
                  similarity {score.toFixed(3)}
                </span>
              </dd>
            </div>
          )}
          <div><dt>Credit</dt><dd>{props.data.credit}</dd></div>
        </dl>
        {item.url && (
          <a className="btn primary drawer-cta" href={item.url} target="_blank" rel="noreferrer">
            Open in Storybook <ExternalIcon size={16} />
          </a>
        )}
      </div>
    </div>
  );
}
