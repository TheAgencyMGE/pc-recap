import type { PeriodKind, PeriodRange } from './types.js';

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
  let boundaryEnd: Date;
  let previousStart: Date;
  let label: string;
  let comparisonLabel: string;

  if (kind === 'today') {
    start = localDate(year, month, day);
    boundaryEnd = localDate(year, month, day + 1);
    previousStart = localDate(year, month, day - 1);
    label = `${monthName(month, 'short')} ${day}`;
    comparisonLabel = 'Same time yesterday';
  } else if (kind === 'week') {
    const current = localDate(year, month, day);
    const mondayOffset = (current.getDay() + 6) % 7;
    start = localDate(year, month, day - mondayOffset);
    boundaryEnd = localDate(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    previousStart = localDate(start.getFullYear(), start.getMonth(), start.getDate() - 7);
    const finish = localDate(boundaryEnd.getFullYear(), boundaryEnd.getMonth(), boundaryEnd.getDate() - 1);
    label = `${monthName(start.getMonth(), 'short')} ${start.getDate()}–${finish.getDate()}`;
    comparisonLabel = 'Same time last week';
  } else if (kind === 'month') {
    start = localDate(year, month, 1);
    boundaryEnd = localDate(year, month + 1, 1);
    previousStart = localDate(year, month - 1, 1);
    label = `${monthName(month)} ${year}`;
    comparisonLabel = 'Same point last month';
  } else if (kind === 'year') {
    start = localDate(year, 0, 1);
    boundaryEnd = localDate(year + 1, 0, 1);
    previousStart = localDate(year - 1, 0, 1);
    label = String(year);
    comparisonLabel = 'Same point last year';
  } else if (kind === 'decade') {
    const decade = Math.floor(year / 10) * 10;
    start = localDate(decade, 0, 1);
    boundaryEnd = localDate(decade + 10, 0, 1);
    previousStart = localDate(decade - 10, 0, 1);
    label = `${decade}–${decade + 9}`;
    comparisonLabel = 'Previous decade';
  } else {
    start = localDate(1970, 0, 1);
    boundaryEnd = localDate(year + 1, 0, 1);
    previousStart = start;
    label = 'Your complete archive';
    comparisonLabel = 'All recorded history';
  }

  const isAllTime = kind === 'all-time';
  const isCurrent = !isAllTime && now.getTime() >= start.getTime() && now.getTime() < boundaryEnd.getTime();
  const isComplete = !isAllTime && !isCurrent;
  const end = isCurrent ? now : boundaryEnd;
  const elapsed = Math.max(0, end.getTime() - start.getTime());
  const previousEnd = isAllTime ? previousStart : isComplete ? start : new Date(previousStart.getTime() + elapsed);

  return {
    label,
    start: iso(start),
    end: iso(end),
    previousStart: iso(previousStart),
    previousEnd: iso(previousEnd),
    isComplete,
    comparisonLabel,
  };
}
