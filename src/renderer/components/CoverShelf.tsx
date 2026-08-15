import type { CollectionCoverModel } from '../lib/collection-covers';
import type { RouteId } from '../routes';
import { CollectionCover } from './CollectionCover';

export function CoverShelf({ title, covers, onNavigate }: { title: string; covers: CollectionCoverModel[]; onNavigate: (route: RouteId) => void }) {
  const track = useRef<HTMLDivElement>(null);
  if (!covers.length) return null;
  const move = (direction: number) => track.current?.scrollBy({ left: direction * Math.max(260, track.current.clientWidth * .72), behavior: 'smooth' });
  return <section className="cover-shelf" aria-labelledby={`shelf-${title.replace(/\s+/g, '-').toLowerCase()}`}>
    <header><h2 id={`shelf-${title.replace(/\s+/g, '-').toLowerCase()}`}>{title}</h2><div><button type="button" aria-label={`Previous ${title}`} onClick={() => move(-1)}><ChevronLeft /></button><button type="button" aria-label={`Next ${title}`} onClick={() => move(1)}><ChevronRight /></button></div></header>
    <div className="cover-shelf__track" role="list" ref={track} tabIndex={0} onKeyDown={(event) => { if (event.key === 'ArrowRight') move(1); if (event.key === 'ArrowLeft') move(-1); }}>
      {covers.map((cover, index) => <div role="listitem" key={cover.id}><CollectionCover model={cover} index={index} onOpen={() => onNavigate(cover.route)} /></div>)}
    </div>
  </section>;
}
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';
