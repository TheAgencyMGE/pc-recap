import { useMemo, useState } from 'react';
import type {
  Achievement, OnThisDayEntry, PeriodKind, PeriodSummary, TimelineBucket,
  TrackedApp, TrackingStatus,
} from '../../shared/types';
import { CollectionCover } from '../components/CollectionCover';
import { CoverShelf } from '../components/CoverShelf';
import { MinimalHeader } from '../components/MinimalHeader';
import { buildAppCovers, buildArchiveCovers, buildRecapCovers } from '../lib/collection-covers';
import type { RouteId } from '../routes';

export function CollectionHome({
  summaries,
  timeline,
  achievements,
  apps,
  onThisDay,
  status,
  onNavigate,
  onToggleTracking,
}: {
  summaries: Partial<Record<PeriodKind, PeriodSummary>>;
  timeline: TimelineBucket[];
  achievements: Achievement[];
  apps: TrackedApp[];
  onThisDay: OnThisDayEntry[];
  status: TrackingStatus;
  onNavigate: (route: RouteId) => void;
  onToggleTracking: () => void;
}) {
  const [query, setQuery] = useState('');
  const recapCovers = useMemo(() => buildRecapCovers(summaries), [summaries]);
  const archiveCovers = useMemo(() => buildArchiveCovers(timeline, onThisDay, achievements), [achievements, onThisDay, timeline]);
  const appCovers = useMemo(() => buildAppCovers(apps, summaries['all-time']?.topApps ?? []), [apps, summaries]);
  const filteredApps = query.trim()
    ? appCovers.filter((cover) => cover.kind === 'app' && cover.title.toLowerCase().includes(query.trim().toLowerCase()))
    : appCovers;
  const today = recapCovers[0];

  return <div className="collection-app">
    <MinimalHeader status={status} query={query} onQueryChange={setQuery} onNavigate={onNavigate} onToggleTracking={onToggleTracking} />
    <main className="collection-home">
      {today && <section className="today-feature" aria-label="Today"><CollectionCover model={today} onOpen={() => onNavigate('today')} /></section>}
      <CoverShelf title="Your recaps" covers={recapCovers.slice(1)} onNavigate={onNavigate} />
      <CoverShelf title="From the archive" covers={archiveCovers} onNavigate={onNavigate} />
      <CoverShelf title="Your apps" covers={filteredApps} onNavigate={onNavigate} />
    </main>
  </div>;
}
