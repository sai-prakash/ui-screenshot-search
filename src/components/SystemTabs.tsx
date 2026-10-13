import { useRef } from 'react';
import type { SystemId, SystemInfo } from '../lib/systems';

type Props = {
  systems: SystemInfo[];
  active: SystemId;
  pending: SystemId | null;
  counts: Partial<Record<SystemId, number>>;
  panelId: string;
  onPick: (id: SystemId) => void;
};

/** Segmented tabs; arrow keys move and select (automatic activation). */
export function SystemTabs(props: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = props.systems.findIndex((s) => s.id === (props.pending ?? props.active));
  const move = (to: number) => {
    const n = props.systems.length;
    const i = (to + n) % n;
    refs.current[i]?.focus();
    props.onPick(props.systems[i]!.id);
  };
  return (
    <div className="tabs" role="tablist" aria-label="Design system" data-testid="systems">
      {props.systems.map((sys, i) => {
        const selected = i === idx;
        return (
          <button
            key={sys.id}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            id={`tab-${sys.id}`}
            aria-selected={selected}
            aria-controls={props.panelId}
            tabIndex={selected ? 0 : -1}
            className="tab"
            onClick={() => props.onPick(sys.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); move(i + 1); }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1); }
              else if (e.key === 'Home') { e.preventDefault(); move(0); }
              else if (e.key === 'End') { e.preventDefault(); move(props.systems.length - 1); }
            }}
          >
            {sys.name}
            {props.counts[sys.id] !== undefined && <span className="tab-count">{props.counts[sys.id]}</span>}
          </button>
        );
      })}
    </div>
  );
}
