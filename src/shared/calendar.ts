import type { ActivitySession } from './types.js';

export interface SessionAllocation {
  startedAt: string;
  endedAt: string;
  seconds: number;
}

const pad = (value: number) => String(value).padStart(2, '0');

export function localDayKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localMonthKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function localYearKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return String(date.getFullYear());
}

function sessionBounds(session: ActivitySession) {
  const start = new Date(session.startedAt).getTime();
  const declaredEnd = new Date(session.endedAt).getTime();
  const durationEnd = start + Math.max(0, session.durationSeconds) * 1_000;
  return { start, end: Math.min(declaredEnd, durationEnd) };
}

export function splitSessionByLocalDay(session: ActivitySession): SessionAllocation[] {
  return splitSession(session, (date) => new Date(
    date.getFullYear(), date.getMonth(), date.getDate() + 1,
  ).getTime());
}

export function splitSessionByLocalHour(session: ActivitySession): Array<SessionAllocation & { hour: number }> {
  return splitSession(session, (date) => new Date(
    date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() + 1,
  ).getTime()).map((allocation) => ({
    ...allocation,
    hour: new Date(allocation.startedAt).getHours(),
  }));
}

export function clipSessionToRange(session: ActivitySession, rangeStart: string, rangeEnd: string): ActivitySession | null {
  const bounds = sessionBounds(session);
  const start = Math.max(bounds.start, new Date(rangeStart).getTime());
  const end = Math.min(bounds.end, new Date(rangeEnd).getTime());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return {
    ...session,
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
    durationSeconds: Math.round((end - start) / 1_000),
  };
}

function splitSession(session: ActivitySession, nextBoundary: (date: Date) => number): SessionAllocation[] {
  const bounds = sessionBounds(session);
  if (!Number.isFinite(bounds.start) || !Number.isFinite(bounds.end) || bounds.end <= bounds.start) return [];
  const allocations: SessionAllocation[] = [];
  let cursor = bounds.start;
  while (cursor < bounds.end) {
    const boundary = nextBoundary(new Date(cursor));
    const segmentEnd = Math.min(boundary, bounds.end);
    if (segmentEnd <= cursor) break;
    allocations.push({
      startedAt: new Date(cursor).toISOString(),
      endedAt: new Date(segmentEnd).toISOString(),
      seconds: Math.round((segmentEnd - cursor) / 1_000),
    });
    cursor = segmentEnd;
  }
  return allocations;
}
