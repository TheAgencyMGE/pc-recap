import { motion } from 'framer-motion';
import type { PeriodSummary } from '../../shared/types';
import { ActivityTape } from '../components/ActivityTape';
import { ObservationPoster } from '../components/ObservationPoster';
import { StatCard } from '../components/StatCard';
import { TrackList } from '../components/TrackList';
import { SparkBars } from '../components/Visuals';
import { SystemLinerNotes } from '../components/SystemLinerNotes';
import { formatClock, formatDate, formatDuration } from '../lib/format';
import { themeForPeriod } from '../lib/visual-theme';
import type { RouteId } from '../routes';

const titles: Record<string, string> = {
  week: 'Week', month: 'Month', 'all-time': 'All time', decade: 'Decade',
};

export function PeriodView({ summary, onNavigate }: { summary: PeriodSummary; onNavigate: (route: RouteId) => void }) {
  const theme = themeForPeriod(summary.kind, summary.label);
  const pair = summary.appPairs[0];
  const chartData = summary.daily.length ? summary.daily : summary.hourly;
  const relationship = pair && summary.relationships.find((item) => (item.appA === pair.appA && item.appB === pair.appB) || (item.appA === pair.appB && item.appB === pair.appA));
  const availableDays = countCalendarDays(summary.kind === 'all-time' ? summary.firstActivity ?? summary.rangeEnd : summary.rangeStart, summary.rangeEnd);
  return <motion.main className={`page period-page period-page--${summary.kind}`} style={{ '--page-bg': theme.background, '--page-fg': theme.foreground, '--page-accent': theme.accent } as React.CSSProperties} initial={false} animate={{ opacity: 1 }}>
    <header className="simple-page-heading"><h1>{titles[summary.kind] ?? summary.label}</h1><span>{summary.label}</span></header>
    <section className="period-cover">
      <div><strong>{formatDuration(summary.totalSeconds)}</strong><p>{summary.previousTotalSeconds > 0 ? `${summary.changePercent >= 0 ? '+' : '−'}${Math.abs(summary.changePercent)}% · ${summary.comparisonLabel}` : 'First comparable chapter'}</p></div>
      <div><ActivityTape data={chartData} colors={summary.topApps.map((app) => app.color)} label={`${summary.label} activity`} /></div>
    </section>
    <section className="stat-ribbon" aria-label={`${summary.label} at a glance`}>
      <StatCard label="Active days" value={`${summary.activeDays.toLocaleString()} of ${availableDays.toLocaleString()}`} note="Days with recorded activity in this chapter" />
      <StatCard label="Foreground intervals" value={summary.sessionCount.toLocaleString()} note="Continuous app runs; idle time can separate them" />
      <StatCard label="First activity" value={summary.firstActivity && availableDays > 1 ? `${formatDate(summary.firstActivity)} · ${formatClock(summary.firstActivity)}` : formatClock(summary.firstActivity)} note="First recorded foreground moment" />
      <StatCard label="Longest session" value={summary.longestSession ? formatDuration(summary.longestSession.durationSeconds) : '—'} note={summary.longestSession?.appName ?? 'No session yet'} accent={summary.longestSession ? theme.accent : undefined} />
    </section>
    <section className="period-spread">
      <article className="track-sheet"><header><h2>Apps</h2></header><TrackList apps={summary.topApps} label={`${summary.label} apps`} onSelect={(id) => onNavigate(`app:${id}`)} /></article>
      <div className="poster-stack">{summary.observations.slice(0, 2).map((observation) => <ObservationPoster key={observation.id} observation={observation} />)}</div>
    </section>
    <section className="period-print"><header><h2>{summary.daily.length ? 'Activity by day' : 'Activity by hour'}</h2></header><SparkBars data={chartData} color={theme.accent} scale={summary.daily.length ? 'day' : 'hour'} /></section>
    <SystemLinerNotes activity={summary.activity} performance={summary.performance} />
    {(pair || summary.categories[0]) && <section className="liner-facts">
      {pair && <div><span>Together</span><b>{pair.appA} + {pair.appB}</b><small>{relationship?.transitions ?? 0} switches across {pair.daysTogether} days</small></div>}
      {summary.categories[0] && <div><span>Category</span><b>{summary.categories[0].name}</b><small>{summary.categories[0].share}% of tracked time</small></div>}
      {summary.longestSession && <div><span>Longest</span><b>{summary.longestSession.appName}</b><small>{formatDuration(summary.longestSession.durationSeconds)}</small></div>}
    </section>}
  </motion.main>;
}

function countCalendarDays(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(Math.max(Date.parse(startIso), Date.parse(endIso) - 1));
  let count = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last && count < 100_000) {
    count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(1, count);
}
