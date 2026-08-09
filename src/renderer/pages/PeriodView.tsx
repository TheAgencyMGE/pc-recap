import { CalendarDays, Clock3, Layers3 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { PeriodSummary } from '../../shared/types';
import { ActivityTape } from '../components/ActivityTape';
import { ObservationPoster } from '../components/ObservationPoster';
import { TrackList } from '../components/TrackList';
import { SparkBars } from '../components/Visuals';
import { formatClock, formatDuration } from '../lib/format';
import { themeForPeriod } from '../lib/visual-theme';
import type { RouteId } from '../routes';

const titles: Record<string, string> = {
  week: 'Week',
  month: 'Month',
  'all-time': 'All time',
  decade: 'Decade',
};

export function PeriodView({ summary, onNavigate }: { summary: PeriodSummary; onNavigate: (route: RouteId) => void }) {
  const theme = themeForPeriod(summary.kind, summary.label);
  const pair = summary.appPairs[0];
  return <motion.main className={`page period-page period-page--${summary.kind}`} style={{ '--page-bg': theme.background, '--page-fg': theme.foreground, '--page-accent': theme.accent } as React.CSSProperties} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <header className="simple-page-heading"><h1>{titles[summary.kind] ?? summary.label}</h1><span>{summary.label}</span></header>
    <section className="period-cover">
      <div><strong>{formatDuration(summary.totalSeconds)}</strong><p>{summary.changePercent >= 0 ? '+' : '-'}{Math.abs(summary.changePercent)}%</p></div>
      <div><ActivityTape data={summary.daily.length ? summary.daily : summary.hourly} colors={summary.topApps.map((app) => app.color)} label={`${summary.label} activity`} /></div>
    </section>
    <dl className="caption-strip">
      <div><dt><CalendarDays /> Days</dt><dd>{summary.activeDays}</dd></div>
      <div><dt><Layers3 /> Sessions</dt><dd>{summary.sessionCount}</dd></div>
      <div><dt><Clock3 /> First</dt><dd>{formatClock(summary.firstActivity)}</dd></div>
      <div><dt>Longest</dt><dd>{summary.longestSession ? formatDuration(summary.longestSession.durationSeconds) : '—'}</dd></div>
    </dl>
    <section className="period-spread">
      <article className="track-sheet"><header><h2>Apps</h2></header><TrackList apps={summary.topApps} label={`${summary.label} apps`} onSelect={(id) => onNavigate(`app:${id}`)} /></article>
      <div className="poster-stack">{summary.observations.slice(0, 2).map((observation) => <ObservationPoster key={observation.id} observation={observation} />)}</div>
    </section>
    <section className="period-print"><header><h2>Activity</h2></header><SparkBars data={summary.daily.length ? summary.daily : summary.hourly} color={theme.accent} /></section>
    {(pair || summary.categories[0]) && <section className="liner-facts">
      {pair && <div><span>Together</span><b>{pair.appA} + {pair.appB}</b><small>{pair.daysTogether} days</small></div>}
      {summary.categories[0] && <div><span>Category</span><b>{summary.categories[0].name}</b><small>{summary.categories[0].share}%</small></div>}
      {summary.longestSession && <div><span>Longest</span><b>{summary.longestSession.appName}</b><small>{formatDuration(summary.longestSession.durationSeconds)}</small></div>}
    </section>}
  </motion.main>;
}
