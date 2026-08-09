import type { CollectionCoverModel } from '../lib/collection-covers';
import type { RouteId } from '../routes';
import { CollectionCover } from './CollectionCover';

export function CoverShelf({ title, covers, onNavigate }: { title: string; covers: CollectionCoverModel[]; onNavigate: (route: RouteId) => void }) {
  if (!covers.length) return null;
  return <section className="cover-shelf" aria-labelledby={`shelf-${title.replace(/\s+/g, '-').toLowerCase()}`}>
    <h2 id={`shelf-${title.replace(/\s+/g, '-').toLowerCase()}`}>{title}</h2>
    <div className="cover-shelf__track" role="list">
      {covers.map((cover, index) => <div role="listitem" key={cover.id}><CollectionCover model={cover} index={index} onOpen={() => onNavigate(cover.route)} /></div>)}
    </div>
  </section>;
}
