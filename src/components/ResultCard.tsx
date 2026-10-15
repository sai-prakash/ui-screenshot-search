import type { MatchLabel } from '../lib/matchStrength';
import { componentName, storyName, type Item } from '../lib/systems';

export type Surface = 'light' | 'dark';

/** Small raster screenshots get blurry when stretched: allow at most 2x their natural size. */
function capUpscale(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.src.endsWith('.svg') || !img.naturalWidth) return;
  img.style.maxWidth = `${img.naturalWidth * 2}px`;
  img.style.maxHeight = `${img.naturalHeight * 2}px`;
}

export function Thumb(props: { item: Item; surface: Surface; lazy?: boolean; big?: boolean }) {
  return (
    <div className={`thumb thumb-${props.surface}`}>
      <img
        src={props.item.src}
        alt={props.big ? `Screenshot of ${componentName(props.item)}` : ''}
        width={400}
        height={300}
        loading={props.lazy ? 'lazy' : 'eager'}
        decoding="async"
        onLoad={capUpscale}
      />
    </div>
  );
}

export function MatchBadge(props: { label: MatchLabel }) {
  return <span className={`match tone-${props.label.tone}`}>{props.label.text}</span>;
}

export function ResultCard(props: {
  item: Item;
  systemName: string;
  surface: Surface;
  label?: MatchLabel;
  lazy?: boolean;
  compact?: boolean;
  onOpen: (el: HTMLElement) => void;
}) {
  const { item } = props;
  const name = componentName(item);
  const story = storyName(item);
  return (
    <button
      type="button"
      className="rcard"
      data-card
      onClick={(e) => props.onOpen(e.currentTarget)}
    >
      <Thumb item={item} surface={props.surface} lazy={props.lazy} />
      <span className="rcard-body">
        <span className="rcard-top">
          <span className="rcard-name">{name}</span>
          {props.label && <MatchBadge label={props.label} />}
        </span>
        <span className="rcard-meta">
          {story && <span className="rcard-story">{story}</span>}
          {!props.compact && <span className="rcard-sys">{props.systemName}</span>}
          {item.state === 'open' && <span className="tag">open state</span>}
        </span>
      </span>
    </button>
  );
}

export function SkeletonCard() {
  return (
    <div className="rcard skeleton" aria-hidden="true">
      <div className="thumb thumb-skel" />
      <span className="rcard-body">
        <span className="skel-line w60" />
        <span className="skel-line w40" />
      </span>
    </div>
  );
}
