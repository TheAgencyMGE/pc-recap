import { generateObservations } from './observations.js';
import { localDayKey, localMonthKey, splitSessionByLocalDay, splitSessionByLocalHour } from './calendar.js';
import type {
  ActivitySession,
  AppPair,
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
function buildPairs(sessions: ActivitySession[]): AppPair[] {
  const appsByDay = new Map<string, Set<string>>();
  for (const item of sessions) {
    for (const allocation of splitSessionByLocalDay(item)) {
      const key = localDayKey(allocation.startedAt);
      const apps = appsByDay.get(key) ?? new Set<string>();
      apps.add(item.appName);
      appsByDay.set(key, apps);
    }
  }

  const counts = new Map<string, AppPair>();
  for (const apps of appsByDay.values()) {
    const names = [...apps].sort((a, b) => a.localeCompare(b));
    for (let a = 0; a < names.length; a += 1) {
      for (let b = a + 1; b < names.length; b += 1) {
        const id = `${names[a]}::${names[b]}`;
        const existing = counts.get(id) ?? {
          appA: names[a], appB: names[b], daysTogether: 0, score: 0,
        };
        existing.daysTogether += 1;
        existing.score = existing.daysTogether;
        counts.set(id, existing);
      }
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.score - a.score || `${a.appA}${a.appB}`.localeCompare(`${b.appA}${b.appB}`),
  );
}

export function detectEras(sessions: ActivitySession[]): Era[] {
  const months = new Map<string, Map<string, { appId: string; name: string; seconds: number; color: string }>>();
  for (const item of sessions) {
    for (const allocation of splitSessionByLocalDay(item)) {
      const key = localMonthKey(allocation.startedAt);
      const apps = months.get(key) ?? new Map();
      const current = apps.get(item.appId) ?? {
        appId: item.appId,
        name: item.appName,
        seconds: 0,
        color: colorFor(item.categoryId),
      };
      current.seconds += allocation.seconds;
      apps.set(item.appId, current);
      months.set(key, apps);
    }
  }

  const winners = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, apps]) => ({
      month,
      app: [...apps.values()].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name))[0],
    }))
    .filter((winner) => winner.app);

  const eras: Era[] = [];
  let runStart = 0;
  for (let index = 1; index <= winners.length; index += 1) {
    const runEnded = index === winners.length || winners[index].app.appId !== winners[runStart].app.appId;
    if (!runEnded) continue;
    if (index - runStart >= 2) {
      const first = winners[runStart];
      const last = winners[index - 1];
      eras.push({
        id: `${first.app.appId}-${first.month}-${last.month}`,
        title: `The ${first.app.name} era`,
        subtitle: `${index - runStart} months at the center of your PC life`,
        start: first.month,
        end: last.month,
        appId: first.app.appId,
        color: first.app.color,
      });
    }
    runStart = index;
  }
  return eras;
}

export function summarizeSessions(
  sessions: ActivitySession[],
  previousSessions: ActivitySession[],
  options: SummaryOptions,
): PeriodSummary {
  const totalSeconds = sessions.reduce((total, item) => total + item.durationSeconds, 0);
  const previousTotalSeconds = previousSessions.reduce((total, item) => total + item.durationSeconds, 0);
  const appMap = new Map<string, AppUsage>();
  const previousApps = new Map<string, number>();
  const categoryMap = new Map<string, number>();
  const hourTotals = Array.from({ length: 24 }, () => 0);
  const hourApps = Array.from({ length: 24 }, () => new Map<string, number>());
  const dailyMap = new Map<string, number>();

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
    }
    for (const allocation of splitSessionByLocalHour(item)) {
      hourTotals[allocation.hour] += allocation.seconds;
      const perApp = hourApps[allocation.hour];
      perApp.set(item.appName, (perApp.get(item.appName) ?? 0) + allocation.seconds);
    }
  }

  const topApps = [...appMap.values()]
    .map((app) => {
      const previous = previousApps.get(app.appId) ?? 0;
      return {
        ...app,
        share: totalSeconds ? Number(((app.seconds / totalSeconds) * 100).toFixed(1)) : 0,
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

  const hourly: TimeBucket[] = hourTotals.map((seconds, hour) => ({ label: String(hour), seconds }));
  const hourlyApps = Object.fromEntries(hourApps.map((apps, hour) => {
    const winner = [...apps.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return [String(hour), winner?.[0] ?? ''];
  }));
  const daily = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, seconds]) => ({ label, seconds }));
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
      detail: `${Math.round(longestSession.durationSeconds / 60)} uninterrupted minutes`,
      achievedAt: longestSession.startedAt,
      icon: 'timer',
    });
  }

  const summary: PeriodSummary = {
    kind: options.kind,
    label: options.label,
    rangeStart: options.rangeStart,
    rangeEnd: options.rangeEnd,
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
    appPairs: buildPairs(sessions),
    eras: detectEras(sessions),
    observations: [],
    records,
    sessionCount: sessions.length,
    activeDays: dailyMap.size,
  };
  summary.observations = generateObservations(summary);
  return summary;
}
