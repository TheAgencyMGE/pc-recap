import { generateObservations } from './observations.js';
import { localDayKey, localMonthKey, splitSessionByLocalDay, splitSessionByLocalHour } from './calendar.js';
import { buildBaselines } from './analytics/baselines.js';
import { detectLifecycleMoments } from './analytics/lifecycle.js';
import { buildRelationships, detectRoutines } from './analytics/relationships.js';
import type {
  ActivityStateInterval,
  ActivitySession,
  AppUsage,
  CategoryUsage,
  Era,
  PeriodKind,
  PeriodSummary,
  RecordItem,
  TimeBucket,
} from './types.js';

interface SummaryOptions {
  kind: PeriodKind;
  label: string;
  rangeStart: string;
  rangeEnd: string;
  isComplete?: boolean;
  comparisonLabel?: string;
  lifecycleSessions?: ActivitySession[];
  lifecycleAsOf?: Date;
  stateIntervals?: ActivityStateInterval[];
  includeIdleInRecapTotals?: boolean;
}

const CATEGORY_META: Record<string, { name: string; color: string }> = {
  gaming: { name: 'Gaming', color: '#75C46B' },
  coding: { name: 'Coding', color: '#8D87FF' },
  browsing: { name: 'Browsing', color: '#5AB7FF' },
  social: { name: 'Social', color: '#FF746A' },
  music: { name: 'Music', color: '#F2C66D' },
  creative: { name: 'Creative', color: '#F08CC6' },
  work: { name: 'Work', color: '#62D8C3' },
  utility: { name: 'Utility', color: '#9AA5B8' },
  other: { name: 'Other', color: '#7D8493' },
};

const colorFor = (categoryId: string) => CATEGORY_META[categoryId]?.color ?? CATEGORY_META.other.color;
export function detectEras(sessions: ActivitySession[]): Era[] {
  if (!sessions.length) return [];
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const historyDays = Math.max(1, Math.ceil((Date.parse(ordered.at(-1)!.endedAt) - Date.parse(ordered[0].startedAt)) / 86_400_000));
  const scale: 'week' | 'month' = historyDays < 75 ? 'week' : 'month';
  type Bucket = {
    total: number;
    apps: Map<string, { appId: string; name: string; seconds: number; categoryId: string; color: string }>;
    categories: Map<string, number>;
  };
  const buckets = new Map<string, Bucket>();
  for (const item of sessions) {
    for (const allocation of splitSessionByLocalDay(item)) {
      const key = scale === 'month' ? localMonthKey(allocation.startedAt) : localWeekKey(allocation.startedAt);
      const bucket = buckets.get(key) ?? { total: 0, apps: new Map(), categories: new Map() };
      const current = bucket.apps.get(item.appId) ?? {
        appId: item.appId,
        name: item.appName,
        seconds: 0,
        categoryId: item.categoryId,
        color: colorFor(item.categoryId),
      };
      current.seconds += allocation.seconds;
      bucket.total += allocation.seconds;
      bucket.apps.set(item.appId, current);
      bucket.categories.set(item.categoryId, (bucket.categories.get(item.categoryId) ?? 0) + allocation.seconds);
      buckets.set(key, bucket);
    }
  }

  const bucketEntries = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  const winners = bucketEntries
    .map(([key, bucket], index) => {
      const classified = classifyEraBucket(key, combineEraBuckets(bucketEntries.slice(Math.max(0, index - 1), index + 2).map(([, nearby]) => nearby)));
      return classified ? { ...classified, share: eraSignatureShare(classified.signature, bucket) } : undefined;
    })
    .filter((winner): winner is NonNullable<typeof winner> => Boolean(winner));

  const eras: Era[] = [];
  let runStart = 0;
  for (let index = 1; index <= winners.length; index += 1) {
    const runEnded = index === winners.length
      || winners[index].signature !== winners[runStart].signature
      || !consecutiveEraBucket(winners[index - 1].key, winners[index].key, scale);
    if (!runEnded) continue;
    if (index - runStart >= 2) {
      const first = winners[runStart];
      const last = winners[index - 1];
      const run = winners.slice(runStart, index);
      const peak = [...run].sort((a, b) => b.share - a.share || a.key.localeCompare(b.key))[0];
      const phase = {
        ...(peak.share - first.share >= .05 ? { rising: first.key } : {}),
        peak: peak.key,
        ...(peak.share - last.share >= .05 ? { fading: last.key } : {}),
      };
      eras.push({
        id: `${first.signature}-${first.key}-${last.key}`,
        title: first.title(scale === 'week'),
        subtitle: `${index - runStart} ${scale}${index - runStart === 1 ? '' : 's'} at the center of your PC life${phase.rising || phase.fading ? ` · peaked ${peak.key}` : ''}`,
        start: first.key,
        end: last.key,
        appId: first.appId,
        color: first.color,
        kind: first.kind,
        phase,
      });
    }
    runStart = index;
  }
  return eras;
}

function eraSignatureShare(signature: string, bucket: {
  total: number;
  apps: Map<string, { seconds: number }>;
  categories: Map<string, number>;
}) {
  if (!bucket.total) return 0;
  const [kind, ...ids] = signature.split(':');
  if (kind === 'app') return (bucket.apps.get(ids[0])?.seconds ?? 0) / bucket.total;
  if (kind === 'category') return (bucket.categories.get(ids[0]) ?? 0) / bucket.total;
  return ids.reduce((sum, appId) => sum + (bucket.apps.get(appId)?.seconds ?? 0), 0) / bucket.total;
}

function combineEraBuckets(buckets: Array<{
  total: number;
  apps: Map<string, { appId: string; name: string; seconds: number; categoryId: string; color: string }>;
  categories: Map<string, number>;
}>) {
  const combined = {
    total: 0,
    apps: new Map<string, { appId: string; name: string; seconds: number; categoryId: string; color: string }>(),
    categories: new Map<string, number>(),
  };
  for (const bucket of buckets) {
    combined.total += bucket.total;
    for (const app of bucket.apps.values()) {
      const current = combined.apps.get(app.appId) ?? { ...app, seconds: 0 };
      current.seconds += app.seconds;
      combined.apps.set(app.appId, current);
    }
    for (const [categoryId, seconds] of bucket.categories) combined.categories.set(categoryId, (combined.categories.get(categoryId) ?? 0) + seconds);
  }
  return combined;
}

function classifyEraBucket(key: string, bucket: {
  total: number;
  apps: Map<string, { appId: string; name: string; seconds: number; categoryId: string; color: string }>;
  categories: Map<string, number>;
}) {
  if (!bucket.total) return undefined;
  const apps = [...bucket.apps.values()].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
  const categories = [...bucket.categories.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = apps[0];
  const second = apps[1];
  const topShare = top.seconds / bucket.total;
  if (topShare >= .45) return {
    key, signature: `app:${top.appId}`, share: topShare, appId: top.appId, color: top.color, kind: 'app' as const,
    title: (mini: boolean) => `The ${top.name} ${mini ? 'mini era' : 'era'}`,
  };
  const mixedShare = second ? (top.seconds + second.seconds) / bucket.total : 0;
  if (second && top.categoryId !== second.categoryId && mixedShare >= .65) {
    const pair = [top, second].sort((a, b) => a.appId.localeCompare(b.appId));
    return {
      key, signature: `mixed:${pair[0].appId}:${pair[1].appId}`, share: mixedShare,
      appId: `mixed:${pair[0].appId}:${pair[1].appId}`, color: top.color, kind: 'mixed' as const,
      title: (mini: boolean) => `${pair[0].name} + ${pair[1].name} ${mini ? 'mini chapter' : 'chapter'}`,
    };
  }
  const [categoryId, categorySeconds] = categories[0] ?? [];
  const categoryShare = categorySeconds ? categorySeconds / bucket.total : 0;
  if (categoryId && categoryShare >= .55) return {
    key, signature: `category:${categoryId}`, share: categoryShare, appId: `category:${categoryId}`,
    color: colorFor(categoryId), kind: 'category' as const,
    title: (mini: boolean) => `Your ${CATEGORY_META[categoryId]?.name ?? 'Other'} ${mini ? 'mini stretch' : 'stretch'}`,
  };
  return undefined;
}

function localWeekKey(iso: string) {
  const date = new Date(iso);
  const mondayOffset = (date.getDay() + 6) % 7;
  return localDayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset));
}

function consecutiveEraBucket(previous: string, current: string, scale: 'week' | 'month') {
  if (scale === 'week') return Math.round((Date.parse(`${current}T12:00:00`) - Date.parse(`${previous}T12:00:00`)) / 86_400_000) === 7;
  const [year, month] = previous.split('-').map(Number);
  return localMonthKey(new Date(year, month, 1)) === current;
}

export function summarizeSessions(
  sessions: ActivitySession[],
  previousSessions: ActivitySession[],
  options: SummaryOptions,
): PeriodSummary {
  sessions = sessions.filter((session) => !isIdleLikeSession(session));
  previousSessions = previousSessions.filter((session) => !isIdleLikeSession(session));
  const totalSeconds = sessions.reduce((total, item) => total + item.durationSeconds, 0);
  const previousTotalSeconds = previousSessions.reduce((total, item) => total + item.durationSeconds, 0);
  const appMap = new Map<string, AppUsage>();
  const previousApps = new Map<string, number>();
  const categoryMap = new Map<string, number>();
  const hourTotals = Array.from({ length: 24 }, () => 0);
  const hourApps = Array.from({ length: 24 }, () => new Map<string, number>());
  const hourCategories = Array.from({ length: 24 }, () => new Map<string, number>());
  const dailyMap = new Map<string, number>();
  const dailyApps = new Map<string, Map<string, number>>();
  const dailyCategories = new Map<string, Map<string, number>>();

  for (const item of previousSessions) {
    previousApps.set(item.appId, (previousApps.get(item.appId) ?? 0) + item.durationSeconds);
  }

  for (const item of sessions) {
    const app = appMap.get(item.appId) ?? {
      appId: item.appId,
      name: item.appName,
      categoryId: item.categoryId,
      seconds: 0,
      sessions: 0,
      share: 0,
      color: colorFor(item.categoryId),
    };
    app.seconds += item.durationSeconds;
    app.sessions += 1;
    appMap.set(item.appId, app);
    categoryMap.set(item.categoryId, (categoryMap.get(item.categoryId) ?? 0) + item.durationSeconds);
    for (const allocation of splitSessionByLocalDay(item)) {
      const key = localDayKey(allocation.startedAt);
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + allocation.seconds);
      const apps = dailyApps.get(key) ?? new Map<string, number>();
      apps.set(item.appName, (apps.get(item.appName) ?? 0) + allocation.seconds);
      dailyApps.set(key, apps);
      const categories = dailyCategories.get(key) ?? new Map<string, number>();
      categories.set(item.categoryId, (categories.get(item.categoryId) ?? 0) + allocation.seconds);
      dailyCategories.set(key, categories);
    }
    for (const allocation of splitSessionByLocalHour(item)) {
      hourTotals[allocation.hour] += allocation.seconds;
      const perApp = hourApps[allocation.hour];
      perApp.set(item.appName, (perApp.get(item.appName) ?? 0) + allocation.seconds);
      const perCategory = hourCategories[allocation.hour];
      perCategory.set(item.categoryId, (perCategory.get(item.categoryId) ?? 0) + allocation.seconds);
    }
  }

  const topApps = [...appMap.values()]
    .map((app) => {
      const previous = previousApps.get(app.appId) ?? 0;
      return {
        ...app,
        share: totalSeconds ? Number(((app.seconds / totalSeconds) * 100).toFixed(1)) : 0,
        previousSeconds: previous,
        changePercent: previous ? Math.round(((app.seconds - previous) / previous) * 100) : undefined,
      };
    })
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));

  const categories: CategoryUsage[] = [...categoryMap.entries()]
    .map(([categoryId, seconds]) => ({
      categoryId,
      name: CATEGORY_META[categoryId]?.name ?? 'Other',
      seconds,
      share: totalSeconds ? Number(((seconds / totalSeconds) * 100).toFixed(1)) : 0,
      color: colorFor(categoryId),
    }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));

  const hourly: TimeBucket[] = hourTotals.map((seconds, hour) => ({
    label: String(hour), seconds,
    leadingApp: [...hourApps[hour].entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0],
    leadingCategory: categoryName(winner(hourCategories[hour])),
  }));
  const hourlyApps = Object.fromEntries(hourApps.map((apps, hour) => {
    const winner = [...apps.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return [String(hour), winner?.[0] ?? ''];
  }));
  const daily = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, seconds]) => ({
    label, seconds,
    leadingApp: winner(dailyApps.get(label)),
    leadingCategory: categoryName(winner(dailyCategories.get(label))),
  }));
  const sortedByStart = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const longestSession = [...sessions].sort(
    (a, b) => b.durationSeconds - a.durationSeconds || a.startedAt.localeCompare(b.startedAt),
  )[0];
  const records: RecordItem[] = [];
  if (longestSession) {
    records.push({
      id: 'longest-session',
      label: 'Longest single session',
      value: longestSession.appName,
      detail: longestSession.durationSeconds < 60 ? '<1 uninterrupted minute' : `${Math.round(longestSession.durationSeconds / 60)} uninterrupted minutes`,
      achievedAt: longestSession.startedAt,
      icon: 'timer',
    });
  }

  const summary: PeriodSummary = {
    kind: options.kind,
    label: options.label,
    rangeStart: options.rangeStart,
    rangeEnd: options.rangeEnd,
    isComplete: options.isComplete ?? false,
    comparisonLabel: options.comparisonLabel ?? 'Previous period',
    totalSeconds,
    previousTotalSeconds,
    changePercent: previousTotalSeconds
      ? Math.round(((totalSeconds - previousTotalSeconds) / previousTotalSeconds) * 100)
      : totalSeconds > 0 ? 100 : 0,
    firstActivity: sortedByStart[0]?.startedAt,
    lastActivity: sortedByStart.at(-1)?.endedAt,
    longestSession,
    topApps,
    categories,
    hourly,
    hourlyApps,
    daily,
    appPairs: buildRelationships(sessions).filter((relationship) => relationship.distinctDays >= 2).map((relationship) => ({
      appA: relationship.appA,
      appB: relationship.appB,
      daysTogether: relationship.distinctDays,
      score: relationship.score,
    })),
    relationships: buildRelationships(sessions),
    routines: detectRoutines(sessions),
    baselines: buildBaselines(sessions),
    lifecycle: detectLifecycleMoments(
      options.lifecycleSessions ?? sessions,
      options.lifecycleAsOf ?? new Date(options.rangeEnd),
    ).filter((moment) => moment.occurredAt >= options.rangeStart && moment.occurredAt < options.rangeEnd),
    eras: detectEras(sessions),
    observations: [],
    records,
    sessionCount: sessions.length,
    activeDays: dailyMap.size,
    activity: buildActivityBreakdown(totalSeconds, options.stateIntervals ?? [], Boolean(options.includeIdleInRecapTotals)),
  };
  summary.observations = generateObservations(summary);
  return summary;
}

function buildActivityBreakdown(
  activeSeconds: number,
  intervals: ActivityStateInterval[],
  includesIdleInRecapTotal: boolean,
) {
  const secondsFor = (state: ActivityStateInterval['state']) => intervals
    .filter((interval) => interval.state === state)
    .reduce((sum, interval) => sum + interval.durationSeconds, 0);
  const passiveSeconds = secondsFor('passive');
  const idleSeconds = secondsFor('idle');
  const observedSeconds = activeSeconds + passiveSeconds + idleSeconds;
  return {
    activeSeconds,
    passiveSeconds,
    idleSeconds,
    lockedSeconds: secondsFor('locked'),
    suspendedSeconds: secondsFor('suspended'),
    unavailableSeconds: secondsFor('unavailable'),
    untrackedSeconds: secondsFor('untracked'),
    observedSeconds,
    awayPercentage: observedSeconds ? Math.round((idleSeconds / observedSeconds) * 100) : 0,
    recapTotalSeconds: activeSeconds + passiveSeconds + (includesIdleInRecapTotal ? idleSeconds : 0),
    includesIdleInRecapTotal,
  };
}

function isIdleLikeSession(session: ActivitySession) {
  const identity = `${session.appId} ${session.appName}`.trim().toLowerCase();
  return identity === 'idle idle' || session.appId.toLowerCase() === 'idle' || session.appName.trim().toLowerCase() === 'idle';
}

function winner(values?: Map<string, number>) {
  return values ? [...values.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] : undefined;
}

function categoryName(categoryId?: string) {
  return categoryId ? CATEGORY_META[categoryId]?.name ?? 'Other' : undefined;
}
