import { motion } from 'framer-motion';
import type { PeriodSummary, TimelineBucket } from '../../shared/types';
import { ActivityTape } from '../components/ActivityTape';
import { ObservationPoster } from '../components/ObservationPoster';
import { TrackList } from '../components/TrackList';
import { SparkBars } from '../components/Visuals';
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
    <dl className="caption-strip">
      <div><dt>First</dt><dd>{formatClock(summary.firstActivity)}</dd></div>
      <div><dt>Last</dt><dd>{formatClock(summary.lastActivity)}</dd></div>
      <div><dt>Top app</dt><dd>{summary.topApps[0]?.name}</dd></div>
      <div><dt>Sessions</dt><dd>{summary.sessionCount.toLocaleString()}</dd></div>
    </dl>
    <section className="today-spread">
      <article className="track-sheet"><header><h2>Apps</h2></header><TrackList apps={summary.topApps} label="Apps" onSelect={(id) => onNavigate(`app:${id}`)} /></article>
      {lead && <ObservationPoster observation={lead} />}
    </section>
    <section className="print-chart-section"><header><h2>Activity</h2></header><SparkBars data={summary.hourly} color={theme.accent} /></section>
  </motion.main>;
}
