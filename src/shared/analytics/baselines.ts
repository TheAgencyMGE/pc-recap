import { localDayKey, splitSessionByLocalDay, splitSessionByLocalHour } from '../calendar.js';
import type { ActivitySession, BaselineFacts } from '../types.js';

export function buildBaselines(sessions: ActivitySession[]): BaselineFacts {
  const daily = new Map<string, number>();
  const firstHours: number[] = [];
  const lastHours: number[] = [];
  const weekdayTotals = Array.from({ length: 7 }, () => 0);
  const byDay = new Map<string, ActivitySession[]>();
  for (const session of sessions) {
    for (const allocation of splitSessionByLocalDay(session)) {
      const key = localDayKey(allocation.startedAt);
      daily.set(key, (daily.get(key) ?? 0) + allocation.seconds);
      weekdayTotals[new Date(allocation.startedAt).getDay()] += allocation.seconds;
      byDay.set(key, [...(byDay.get(key) ?? []), session]);
    }
  }
  for (const daySessions of byDay.values()) {
    const ordered = [...daySessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    firstHours.push(new Date(ordered[0].startedAt).getHours());
    lastHours.push(new Date(ordered.at(-1)!.endedAt).getHours());
  }
  const totals = [...daily.values()].sort((a, b) => a - b);
  const totalSeconds = totals.reduce((sum, seconds) => sum + seconds, 0);
  return {
    activeDays: totals.length,
    averageDailySeconds: totals.length ? Math.round(totalSeconds / totals.length) : 0,
    medianDailySeconds: median(totals),
    busiestWeekday: weekdayTotals.indexOf(Math.max(...weekdayTotals)),
    typicalFirstHour: median(firstHours.sort((a, b) => a - b)),
    typicalLastHour: median(lastHours.sort((a, b) => a - b)),
    nightSeconds: sessions.reduce((sum, session) => sum + splitSessionByLocalHour(session)
      .filter(({ hour }) => hour < 5)
      .reduce((subtotal, allocation) => subtotal + allocation.seconds, 0), 0),
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2);
}
