import type {
  Achievement, AppUsage, OnThisDayEntry, PeriodKind, PeriodSummary,
  TimeBucket, TimelineBucket, TrackedApp,
} from '../../shared/types';
import type { RouteId } from '../routes';
import { formatDuration } from './format';
import { themeForApp, themeForPeriod, type MixtapeTheme } from './visual-theme';

export type CoverKind = 'today' | 'period' | 'year' | 'archive' | 'record' | 'app' | 'utility';

export interface CollectionCoverModel {
  id: string;
  kind: CoverKind;
  title: string;
  route: RouteId;
  colors: MixtapeTheme;
  value?: string;
  subtitle?: string;
  tape?: TimeBucket[];
  appId?: string;
  appColor?: string;
}

const PERIOD_ORDER: PeriodKind[] = ['today', 'week', 'month', 'year', 'all-time', 'decade'];

const periodTitle = (kind: PeriodKind, summary?: PeriodSummary) => {
  if (kind === 'today') return 'Today';
  if (kind === 'week') return 'This week';
  if (kind === 'month') return summary?.label.split(' ')[0] ?? 'This month';
  if (kind === 'year') return summary?.label ?? 'This year';
  if (kind === 'all-time') return 'All time';
  return summary?.label ?? 'Decade';
};

export function buildRecapCovers(summaries: Partial<Record<PeriodKind, PeriodSummary>>): CollectionCoverModel[] {
  return PERIOD_ORDER.map((kind) => {
    const summary = summaries[kind];
    const title = periodTitle(kind, summary);
    const active = Boolean(summary?.sessionCount && summary.totalSeconds > 0);
    const theme = themeForPeriod(kind, summary?.label ?? title);
    return {
      id: `recap-${kind}`,
      kind: kind === 'today' ? 'today' : kind === 'year' ? 'year' : 'period',
      title,
      route: kind,
      colors: theme,
      ...(active ? {
        value: formatDuration(summary!.totalSeconds),
        subtitle: summary!.topApps[0]?.name,
        tape: summary!.daily.length ? summary!.daily : summary!.hourly,
      } : {}),
    };
  });
}

export function buildArchiveCovers(
  timeline: TimelineBucket[],
  onThisDay: OnThisDayEntry[],
  achievements: Achievement[],
): CollectionCoverModel[] {
  const covers: CollectionCoverModel[] = [];
  if (onThisDay.length) covers.push({
    id: 'archive-on-this-day', kind: 'archive', title: 'On this day', route: 'on-this-day',
    value: `${onThisDay.length} ${onThisDay.length === 1 ? 'year' : 'years'}`,
    subtitle: onThisDay[0]?.topApp,
    colors: themeForPeriod('month', 'on-this-day'),
  });
  if (timeline.length) covers.push({
    id: 'archive-timeline', kind: 'archive', title: 'Timeline', route: 'timeline',
    value: `${timeline.length} ${timeline.length === 1 ? 'chapter' : 'chapters'}`,
    colors: themeForPeriod('all-time', 'timeline'),
  });
  const unlocked = achievements.filter((item) => item.unlockedAt);
  if (unlocked.length) covers.push({
    id: 'archive-records', kind: 'record', title: 'Records', route: 'achievements',
    value: unlocked.length.toLocaleString(), subtitle: unlocked.at(-1)?.title,
    colors: themeForPeriod('week', 'records'),
  });
  return covers;
}

export function buildAppCovers(apps: TrackedApp[], usage: AppUsage[]): CollectionCoverModel[] {
  if (!apps.length) return [];
  const usageById = new Map(usage.map((item) => [item.appId, item]));
  const ordered = [...apps].sort((a, b) => (usageById.get(b.id)?.seconds ?? 0) - (usageById.get(a.id)?.seconds ?? 0));
  const covers: CollectionCoverModel[] = ordered.map((app) => {
    const recorded = usageById.get(app.id);
    return {
      id: `app-${app.id}`,
      kind: 'app',
      title: app.name,
      route: `app:${app.id}`,
      colors: themeForApp(app.id, app.color),
      appId: app.id,
      appColor: app.color,
      ...(recorded?.seconds ? { value: formatDuration(recorded.seconds) } : {}),
    };
  });
  covers.push({
    id: 'app-categories', kind: 'utility', title: 'Categories', route: 'categories',
    colors: themeForPeriod('decade', 'categories'),
  });
  return covers;
}
