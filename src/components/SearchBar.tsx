import { useSyncExternalStore, type Ref } from 'react';
import { ImageIcon, SearchIcon, CloseIcon } from './icons';

type Props = {
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onClear: () => void;
  onUpload: () => void;
  uploadDisabled?: boolean;
  onArrowDown: () => void;
  ref?: Ref<HTMLInputElement>;
};

const NARROW = '(max-width: 600px)';
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const isNarrow = () => window.matchMedia(NARROW).matches;

export function SearchBar({ ref, ...props }: Props) {
  const narrow = useSyncExternalStore(subscribe, isNarrow, () => false);
  return (
    <div className="searchbar" role="search">
      <span className="searchbar-icon" aria-hidden="true">
        {props.busy ? <span className="spinner" /> : <SearchIcon size={20} />}
      </span>
      <input
        ref={ref}
        type="search"
        data-testid="query"
        aria-label="Describe a component"
        placeholder={narrow ? 'Describe a component…' : "Describe a component… e.g. 'on off switch'"}
        autoComplete="off"
        spellCheck={false}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            if (props.value) props.onClear();
            else e.currentTarget.blur();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            props.onArrowDown();
          }
        }}
      />
      {props.value ? (
        <button className="icon-btn" aria-label="Clear search" onClick={props.onClear}>
          <CloseIcon size={16} />
        </button>
      ) : (
        <kbd className="kbd" aria-hidden="true">/</kbd>
      )}
      <span className="searchbar-sep" aria-hidden="true" />
      <button className="icon-btn" disabled={props.uploadDisabled} aria-label="Search by screenshot (upload, or paste anywhere)" title="Search by screenshot (or paste one)" onClick={props.onUpload} data-testid="upload">
        <ImageIcon size={20} />
      </button>
    </div>
  );
}
