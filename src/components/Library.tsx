import { useState } from 'react';
import { ResultCard, type Surface } from './ResultCard';
import { ChevronIcon } from './icons';
import { handleGridKeys } from './keys';
import type { Item } from '../lib/systems';

const PAGE = 24;

export function Library(props: { items: Item[]; noun: string; systemName: string; surface: Surface; onOpen: (item: Item, el: HTMLElement) => void }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const left = props.items.length - limit;
  return (
    <section className="library" aria-label="Library">
      <button className="disclosure" aria-expanded={open} aria-controls="library-grid" onClick={() => setOpen((o) => !o)}>
        <ChevronIcon size={16} />
        Browse all {props.items.length} {props.noun}
      </button>
      {open && (
        <>
          <div className="lib-grid" id="library-grid" data-testid="library" onKeyDown={(e) => handleGridKeys(e)}>
            {props.items.slice(0, limit).map((it) => (
              <ResultCard key={it.id} item={it} systemName={props.systemName} surface={props.surface} lazy compact
                onOpen={(el) => props.onOpen(it, el)} />
            ))}
          </div>
          {left > 0 && (
            <button className="btn more" onClick={() => setLimit((n) => n + PAGE * 2)}>
              Show {Math.min(left, PAGE * 2)} more <span className="muted">({left} left)</span>
            </button>
          )}
        </>
      )}
    </section>
  );
}
