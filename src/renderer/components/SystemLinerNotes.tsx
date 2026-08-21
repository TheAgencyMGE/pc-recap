import type { ActivityBreakdown, PerformanceSummary } from '../../shared/types';
import { formatClock, formatDuration } from '../lib/format';

export function SystemLinerNotes({ activity, performance }: { activity: ActivityBreakdown; performance?: PerformanceSummary }) {
  const awaySeconds = activity.idleSeconds + activity.lockedSeconds;
  const facts: Array<{ label: string; value: string; note: string; title?: string }> = [
    {
      label: 'Active app time', value: formatDuration(activity.activeSeconds),
      note: activity.includesIdleInRecapTotal ? 'Recap total also includes idle time' : 'Idle time is separate from app rankings',
    },
    {
      label: 'Idle or locked', value: formatDuration(awaySeconds),
      note: activity.observedSeconds ? `${activity.awayPercentage}% of observed active-or-idle time` : 'No away state recorded',
    },
  ];
  if (activity.passiveSeconds > 0) facts.push({
    label: 'Passive foreground', value: formatDuration(activity.passiveSeconds), note: 'Foreground time recorded as passive context',
  });
  if (performance?.cpuPeak !== undefined) facts.push({
    label: 'Peak system CPU', value: `${formatMetric(performance.cpuPeak)}%`,
    note: performance.cpuPeakAt ? `Recorded at ${formatClock(performance.cpuPeakAt)}` : 'Highest supported system sample',
    title: performance.cpuPeakAt,
  });
  if (performance?.memoryPercentPeak !== undefined) facts.push({
    label: 'Peak memory use', value: `${formatMetric(performance.memoryPercentPeak)}%`,
    note: performance.memoryUsedPeakBytes === undefined ? 'Highest supported memory sample' : `${formatBytes(performance.memoryUsedPeakBytes)} in use`,
  });
  if (performance?.pluggedInPercentage !== undefined) facts.push({
    label: 'Plugged in', value: `${performance.pluggedInPercentage}%`, note: 'Share of recorded power-state samples',
  });
  return <section className="system-liner-notes" aria-label="Activity and computer performance context">
    <header><h2>Computer liner notes</h2><p>What the time meant, and what the computer experienced.</p></header>
    <div>{facts.map((fact) => <article key={fact.label} title={fact.title}><span>{fact.label}</span><b>{fact.value}</b><small>{fact.note}</small></article>)}</div>
    {performance?.highestLoadContext && <p className="system-liner-notes__context"><b>{performance.highestLoadContext.appName}</b> was foreground during the highest sustained system load. This describes whole-system load, not that app’s exact CPU use.</p>}
  </section>;
}

function formatMetric(value: number) { return Number(value.toFixed(1)).toLocaleString(); }
function formatBytes(value: number) {
  const gibibytes = value / 1024 ** 3;
  return `${Number(gibibytes.toFixed(gibibytes >= 10 ? 0 : 1))} GB`;
}
