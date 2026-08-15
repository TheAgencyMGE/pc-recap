import { useMemo, useState } from 'react';
import type {
  Achievement, OnThisDayEntry, PeriodKind, PeriodSummary, TimelineBucket,
  TrackedApp, TrackingStatus,
} from '../../shared/types';
import { CollectionCover } from '../components/CollectionCover';
import { CoverShelf } from '../components/CoverShelf';
import { MinimalHeader } from '../components/MinimalHeader';
import { SearchOverlay } from '../components/SearchOverlay';
import { buildAppCovers, buildArchiveCovers, buildRecapCovers } from '../lib/collection-covers';
import type { RouteId } from '../routes';

export function CollectionHome({
  summaries,
  timeline,
  achievements,
  apps,
  onThisDay,
  status,
  trackingEnabled,
  onNavigate,
  onToggleTracking,
}: {
  summaries: Partial<Record<PeriodKind, PeriodSummary>>;
  timeline: TimelineBucket[];
  achievements: Achievement[];
  apps: TrackedApp[];
  onThisDay: OnThisDayEntry[];
  status: TrackingStatus;
  trackingEnabled: boolean;
  onNavigate: (route: RouteId) => void;
  onToggleTracking: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const recapCovers = useMemo(() => buildRecapCovers(summaries), [summaries]);
  const archiveCovers = useMemo(() => buildArchiveCovers(timeline, onThisDay, achievements), [achievements, onThisDay, timeline]);
  const appCovers = useMemo(() => buildAppCovers(apps, summaries['all-time']?.topApps ?? []), [apps, summaries]);
  const today = recapCovers[0];

  return <div className="collection-app">
    <MinimalHeader status={status} trackingEnabled={trackingEnabled} onSearch={() => setSearchOpen(true)} onNavigate={onNavigate} onToggleTracking={onToggleTracking} />
    <SearchOverlay open={searchOpen} apps={apps} onClose={() => setSearchOpen(false)} onNavigate={onNavigate} />
    <main className="collection-home" aria-hidden={searchOpen || undefined}>
      {today && <section className="today-feature" aria-label="Today"><CollectionCover model={today} onOpen={() => onNavigate('today')} /></section>}
      <CoverShelf title="Your recaps" covers={recapCovers.slice(1)} onNavigate={onNavigate} />
      <CoverShelf title="From the archive" covers={archiveCovers} onNavigate={onNavigate} />
      <CoverShelf title="Your apps" covers={appCovers} onNavigate={onNavigate} />
    </main>
  </div>;
}
