import { summarizeSessions } from '../shared/analytics.js';
import { clipSessionToRange, localDayKey, localMonthKey, splitSessionByLocalDay, splitSessionByLocalHour } from '../shared/calendar.js';
import { getPeriodRange } from '../shared/periods.js';
import type {
  Achievement,
  ActivitySession,
  AppDetail,
  DashboardData,
  OnThisDayEntry,
  PeriodKind,
  PeriodSummary,
  RecordItem,
  TimeBucket,
  TrackingStatus,
  LiveActivitySession,
} from '../shared/types.js';
import type { ActivityRepository } from './database.js';

export class AnalyticsService {
  constructor(
    private readonly repository: ActivityRepository,
    private readonly getTrackingStatus: () => TrackingStatus,
    private readonly now: () => Date = () => new Date(),
    private readonly getLiveSession: () => LiveActivitySession | undefined = () => undefined,
  ) {}

  getSummary(kind: PeriodKind, year?: number): PeriodSummary {
    const range = getPeriodRange(kind, this.now(), year);
    return summarizeSessions(
      this.querySessionsWithLive(range.start, range.end),
      this.querySessionsWithLive(range.previousStart, range.previousEnd),
      {
        kind, label: range.label, rangeStart: range.start, rangeEnd: range.end,
        isComplete: range.isComplete, comparisonLabel: range.comparisonLabel,
      },
    );
  }

  private querySessionsWithLive(start: string, end: string): ActivitySession[] {
    const sessions = this.repository.querySessions(start, end);
    const live = this.getLiveSession();
    if (!live || sessions.some((session) => session.id === live.id)) return sessions;
    const clipped = clipSessionToRange(live, start, end);
    return clipped ? [...sessions, clipped].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) : sessions;
  }

  getDashboard(kind: PeriodKind = 'today', year?: number): DashboardData {
    return {
      summary: this.getSummary(kind, year),
      timeline: this.repository.getTimeline('month', kind === 'year' && year ? String(year) : String(this.now().getFullYear())),
      achievements: this.getAchievements(),
      trackingStatus: this.getTrackingStatus(),
    };
  }

  getAppDetail(appId: string): AppDetail | null {
    const app = this.repository.listApps().find((item) => item.id === appId);
    if (!app) return null;
    const sessions = this.repository.getAllSessions().filter((item) => item.appId === appId);
    const totalSeconds = sessions.reduce((sum, item) => sum + item.durationSeconds, 0);
    const byHour = Array.from({ length: 24 }, () => 0);
    const byMonth = new Map<string, number>();
    const activeDays = new Set<string>();
    for (const session of sessions) {
      for (const allocation of splitSessionByLocalHour(session)) byHour[allocation.hour] += allocation.seconds;
      for (const allocation of splitSessionByLocalDay(session)) {
        const day = localDayKey(allocation.startedAt);
        const month = localMonthKey(allocation.startedAt);
        activeDays.add(day);
        byMonth.set(month, (byMonth.get(month) ?? 0) + allocation.seconds);
      }
    }
    const lifetime = summarizeSessions(this.repository.getAllSessions(), [], {
      kind: 'all-time', label: 'All-time', rangeStart: '1970-01-01T00:00:00.000Z', rangeEnd: '9999-12-31T00:00:00.000Z',
    });
    const records: RecordItem[] = sessions.length ? [{
      id: `${appId}-longest`, label: 'Longest visit', value: `${Math.round(Math.max(...sessions.map((item) => item.durationSeconds)) / 60)} min`,
      detail: app.name, achievedAt: [...sessions].sort((a, b) => b.durationSeconds - a.durationSeconds)[0].startedAt, icon: 'timer',
    }] : [];
    const timeline: TimeBucket[] = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, seconds]) => ({ label, seconds }));
    return {
      app,
      totalSeconds,
      sessionCount: sessions.length,
      activeDays: activeDays.size,
      longestSessionSeconds: Math.max(0, ...sessions.map((item) => item.durationSeconds)),
      favoriteHour: byHour.indexOf(Math.max(...byHour)),
      timeline,
      companions: lifetime.appPairs.filter((pair) => pair.appA === app.name || pair.appB === app.name).slice(0, 5),
      records,
    };
  }

  getAchievements(): Achievement[] {
    const sessions = this.repository.getAllSessions().sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const total = sessions.reduce((sum, item) => sum + item.durationSeconds, 0);
    const days = new Set(sessions.flatMap((item) => splitSessionByLocalDay(item).map((allocation) => localDayKey(allocation.startedAt)))).size;
    const apps = new Set(sessions.map((item) => item.appId)).size;
    const night = sessions.reduce((sum, item) => sum + splitSessionByLocalHour(item)
      .filter((allocation) => allocation.hour < 4)
      .reduce((subtotal, allocation) => subtotal + allocation.seconds, 0), 0);
    const definitions = [
      ['first-memory', 'First memory', 'Save your first foreground session.', 'sparkles', sessions.length, 1, '#8D87FF'],
      ['week-in-life', 'A week in the life', 'Build seven distinct days of history.', 'calendar-days', days, 7, '#5AB7FF'],
      ['time-capsule', 'Time capsule', 'Preserve 365 days in your archive.', 'archive', days, 365, '#F2C66D'],
      ['many-worlds', 'Many worlds', 'Visit 10 different applications.', 'orbit', apps, 10, '#F08CC6'],
      ['night-owl', 'Night owl', 'Spend 10 hours computing after midnight.', 'moon-star', night, 36_000, '#8D87FF'],
      ['one-thousand-hours', '1,000-hour club', 'Record one thousand hours of PC life.', 'hourglass', total, 3_600_000, '#FF746A'],
    ] as const;
    const calculatedUnlocks = this.calculateAchievementUnlocks(sessions);
    return definitions.map(([id, title, description, icon, progress, target, accent]) => {
      if (progress >= target && calculatedUnlocks[id]) this.repository.saveAchievementUnlock(id, calculatedUnlocks[id]);
      return {
        id, title, description, icon, progress: Math.min(progress, target), target, accent,
        unlockedAt: progress >= target ? this.repository.getAchievementUnlock(id) ?? calculatedUnlocks[id] : undefined,
      };
    });
  }

  private calculateAchievementUnlocks(sessions: ActivitySession[]): Record<string, string> {
    const unlocks: Record<string, string> = {};
    if (sessions[0]) unlocks['first-memory'] = sessions[0].startedAt;

    const firstByDay = new Map<string, string>();
    for (const session of sessions) {
      for (const allocation of splitSessionByLocalDay(session)) {
        const day = localDayKey(allocation.startedAt);
        const existing = firstByDay.get(day);
        if (!existing || allocation.startedAt < existing) firstByDay.set(day, allocation.startedAt);
      }
    }
    const dayStarts = [...firstByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, startedAt]) => startedAt);
    if (dayStarts[6]) unlocks['week-in-life'] = dayStarts[6];
    if (dayStarts[364]) unlocks['time-capsule'] = dayStarts[364];

    const appFirsts = new Map<string, string>();
    for (const session of sessions) if (!appFirsts.has(session.appId)) appFirsts.set(session.appId, session.startedAt);
    const appStarts = [...appFirsts.values()].sort((a, b) => a.localeCompare(b));
    if (appStarts[9]) unlocks['many-worlds'] = appStarts[9];

    unlocks['night-owl'] = thresholdTimestamp(
      sessions.flatMap((session) => splitSessionByLocalHour(session)
        .filter(({ hour }) => hour < 4)
        .map(({ startedAt, seconds }) => ({ startedAt, seconds }))),
      36_000,
    ) ?? '';
    unlocks['one-thousand-hours'] = thresholdTimestamp(
      sessions.map((session) => ({ startedAt: session.startedAt, seconds: session.durationSeconds })),
      3_600_000,
    ) ?? '';
    return unlocks;
  }

  getOnThisDay(): OnThisDayEntry[] {
    const now = this.now();
    const suffix = localDayKey(now).slice(4);
    const sessions = this.repository.getAllSessions().flatMap((session) => splitSessionByLocalDay(session).map((allocation) => ({
      ...session,
      startedAt: allocation.startedAt,
      endedAt: allocation.endedAt,
      durationSeconds: allocation.seconds,
    })));
    const years = new Map<number, ActivitySession[]>();
    for (const item of sessions.filter((session) => localDayKey(session.startedAt).slice(4) === suffix)) {
      const year = Number(localDayKey(item.startedAt).slice(0, 4));
      if (year === now.getFullYear()) continue;
      years.set(year, [...(years.get(year) ?? []), item]);
    }
    return [...years.entries()].sort(([a], [b]) => b - a).map(([year, items]) => {
      const apps = new Map<string, number>();
      for (const item of items) apps.set(item.appName, (apps.get(item.appName) ?? 0) + item.durationSeconds);
      const sorted = [...items].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      return {
        year,
        totalSeconds: items.reduce((sum, item) => sum + item.durationSeconds, 0),
        topApp: [...apps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown',
        firstActivity: sorted[0]?.startedAt,
        lastActivity: sorted.at(-1)?.endedAt,
      };
    });
  }
}

function thresholdTimestamp(
  allocations: Array<{ startedAt: string; seconds: number }>,
  targetSeconds: number,
): string | undefined {
  let accumulated = 0;
  for (const allocation of [...allocations].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    if (accumulated + allocation.seconds >= targetSeconds) {
      const secondsIntoAllocation = targetSeconds - accumulated;
      return new Date(new Date(allocation.startedAt).getTime() + secondsIntoAllocation * 1_000).toISOString();
    }
    accumulated += allocation.seconds;
  }
  return undefined;
}
