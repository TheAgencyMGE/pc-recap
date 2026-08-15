import { motion } from 'framer-motion';
import type { PeriodSummary, TimelineBucket } from '../../shared/types';
import { ActivityTape } from '../components/ActivityTape';
import { ObservationPoster } from '../components/ObservationPoster';
import { TrackList } from '../components/TrackList';
import { SparkBars } from '../components/Visuals';
import { StatCard } from '../components/StatCard';
import { formatClock, formatDuration } from '../lib/format';
import { themeForPeriod } from '../lib/visual-theme';
import type { RouteId } from '../routes';

export function Dashboard({ summary, timeline: _timeline, onNavigate }: { summary: PeriodSummary; timeline: TimelineBucket[]; onNavigate: (route: RouteId) => void }) {
  const lead = summary.observations[0];
  const theme = themeForPeriod('today', summary.label);
  const colors = summary.topApps.map((app) => app.color);
  return <motion.main className="page today-page" style={{ '--page-bg': theme.background, '--page-fg': theme.foreground, '--page-accent': theme.accent } as React.CSSProperties} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <header className="simple-page-heading"><h1>Today</h1><span>{summary.label}</span></header>
    <section className="today-cover">
      <div className="today-cover__number"><strong>{formatDuration(summary.totalSeconds)}</strong></div>
      <div className="today-cover__tape"><ActivityTape data={summary.hourly} colors={colors.length ? colors : undefined} /></div>
    </section>
    <section className="stat-ribbon" aria-label="Today at a glance">
      <StatCard label="First activity" value={formatClock(summary.firstActivity)} note="When your PC day began" />
      <StatCard label="Last activity" value={formatClock(summary.lastActivity)} note="Most recent tracked moment" />
      <StatCard label="Top app" value={summary.topApps[0]?.name ?? '—'} note={summary.topApps[0] ? `${summary.topApps[0].share}% of tracked time` : 'No activity yet'} accent={summary.topApps[0]?.color} />
      <StatCard label="Sessions" value={summary.sessionCount.toLocaleString()} note="Continuous foreground visits" />
    </section>
    <section className="today-spread">
      <article className="track-sheet"><header><h2>Apps</h2></header><TrackList apps={summary.topApps} label="Apps" onSelect={(id) => onNavigate(`app:${id}`)} /></article>
      {lead && <ObservationPoster observation={lead} />}
    </section>
    <section className="print-chart-section"><header><h2>Activity by hour</h2></header><SparkBars data={summary.hourly} color={theme.accent} scale="hour" /></section>
  </motion.main>;
}
