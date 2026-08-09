import type { PeriodKind } from './types.js';

export interface PeriodRange {
  label: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
}

const iso = (date: Date) => date.toISOString();
const localDate = (year: number, month: number, day: number) => new Date(year, month, day);
const monthName = (month: number, style: 'short' | 'long' = 'long') => new Intl.DateTimeFormat('en-US', {
  month: style,
}).format(localDate(2025, month, 1));

export function getPeriodRange(kind: PeriodKind, now = new Date(), selectedYear?: number): PeriodRange {
  const year = selectedYear ?? now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  let start: Date;
  let end: Date;
  let previousStart: Date;
  let label: string;

  if (kind === 'today') {
    start = localDate(year, month, day);
    end = localDate(year, month, day + 1);
    previousStart = localDate(year, month, day - 1);
    label = `${monthName(month, 'short')} ${day}`;
  } else if (kind === 'week') {
    const current = localDate(year, month, day);
    const mondayOffset = (current.getDay() + 6) % 7;
    start = localDate(year, month, day - mondayOffset);
    end = localDate(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    previousStart = localDate(start.getFullYear(), start.getMonth(), start.getDate() - 7);
    const finish = localDate(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    label = `${monthName(start.getMonth(), 'short')} ${start.getDate()}–${finish.getDate()}`;
  } else if (kind === 'month') {
    start = localDate(year, month, 1);
    end = localDate(year, month + 1, 1);
    previousStart = localDate(year, month - 1, 1);
    label = `${monthName(month)} ${year}`;
  } else if (kind === 'year') {
    start = localDate(year, 0, 1);
    end = localDate(year + 1, 0, 1);
    previousStart = localDate(year - 1, 0, 1);
    label = String(year);
  } else if (kind === 'decade') {
    const decade = Math.floor(year / 10) * 10;
    start = localDate(decade, 0, 1);
    end = localDate(decade + 10, 0, 1);
    previousStart = localDate(decade - 10, 0, 1);
    label = `${decade}–${decade + 9}`;
  } else {
    start = localDate(1970, 0, 1);
    end = localDate(year + 1, 0, 1);
    previousStart = start;
    label = 'Your complete archive';
  }

  return {
    label,
    start: iso(start),
    end: iso(end),
    previousStart: iso(previousStart),
    previousEnd: iso(kind === 'all-time' ? start : start),
  };
}
