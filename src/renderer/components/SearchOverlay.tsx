import { ArrowRight, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { TrackedApp } from '../../shared/types';
import type { RouteId } from '../routes';

interface SearchItem {
  id: string;
  title: string;
  detail: string;
  route: RouteId;
  keywords: string;
}

const DESTINATIONS: SearchItem[] = [
  ['today', 'Today', 'Recap', 'today', 'daily now activity'],
  ['week', 'This week', 'Recap', 'week', 'weekly seven days'],
  ['month', 'This month', 'Recap', 'month', 'monthly'],
  ['year', 'Yearly recap', 'Recap', 'year', 'wrapped annual story'],
  ['all-time', 'All time', 'Recap', 'all-time', 'complete archive lifetime'],
  ['decade', 'Decade', 'Recap', 'decade', 'long term history'],
  ['timeline', 'Timeline', 'Archive', 'timeline', 'years months days history'],
  ['on-this-day', 'On this day', 'Archive', 'on-this-day', 'memories nostalgia'],
  ['achievements', 'Records', 'Archive', 'achievements', 'achievements streaks'],
  ['categories', 'Categories', 'Organize', 'categories', 'manage apps'],
  ['history-recovery', 'Recover older history', 'Archive', 'history-recovery', 'import tracker windows'],
  ['recap-studio', 'Recap Studio', 'Stories', 'recap-studio', 'custom historical season playback'],
  ['settings', 'Settings', 'Controls', 'settings', 'tracking backup privacy'],
].map(([id, title, detail, route, keywords]) => ({ id, title, detail, route: route as RouteId, keywords }));

export function SearchOverlay({ open, apps, onClose, onNavigate }: {
  open: boolean;
  apps: TrackedApp[];
  onClose: () => void;
  onNavigate: (route: RouteId) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const items = useMemo<SearchItem[]>(() => [
    ...DESTINATIONS,
    ...apps.map((app) => ({
      id: `app-${app.id}`,
      title: app.name,
      detail: 'App',
      route: `app:${app.id}` as RouteId,
      keywords: `${app.name} ${app.executable}`,
    })),
  ], [apps]);
  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => (normalized
    ? items.filter((item) => `${item.title} ${item.detail} ${item.keywords}`.toLowerCase().includes(normalized))
    : items), [items, normalized]);
  const groups = useMemo(() => results.reduce<Array<{ name: string; items: Array<SearchItem & { index: number }> }>>((all, item, index) => {
    const name = item.detail === 'App' ? 'Applications'
      : item.detail === 'Recap' || item.detail === 'Stories' ? 'Recaps'
        : item.detail === 'Archive' ? 'History' : 'Settings and organization';
    const group = all.find((entry) => entry.name === name);
    if (group) group.items.push({ ...item, index });
    else all.push({ name, items: [{ ...item, index }] });
    return all;
  }, []), [results]);

  useEffect(() => { if (!open) { setQuery(''); setSelected(0); } }, [open]);
  useEffect(() => { setSelected(0); }, [query]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((value) => Math.max(0, Math.min(results.length - 1, value + 1))); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)); }
      if (event.key === 'Enter' && results[selected]) { onNavigate(results[selected].route); onClose(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, onNavigate, open, results, selected]);
  if (!open) return null;
  return <div className="search-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="search-overlay__panel" role="dialog" aria-modal="true" aria-label="Search PC Recap">
      <label className="search-overlay__input"><Search /><input autoFocus type="search" aria-label="Search PC Recap" placeholder="Apps, recaps, timeline…" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" aria-label="Close search" onClick={onClose}><X /></button></label>
      <div className="search-overlay__results" aria-live="polite">
        {groups.map((group) => <section key={group.name}><h2>{group.name}</h2>{group.items.map((item) => <button type="button" key={item.id} className={item.index === selected ? 'is-selected' : ''} aria-label={`Open ${item.title}`} onMouseEnter={() => setSelected(item.index)} onClick={() => { onNavigate(item.route); onClose(); }}>
          <span><b>{item.title}</b><small>{item.detail}</small></span><ArrowRight />
        </button>)}</section>)}
        {!results.length && <p>No results for “{query.trim()}”</p>}
      </div>
      <footer><span>{results.length} {results.length === 1 ? 'result' : 'results'}</span><span>↑↓ Move</span><span>Enter Open</span><span>Esc Close</span></footer>
    </section>
  </div>;
}
