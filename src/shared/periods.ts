import type { PeriodKind, PeriodRange, RecapSelection } from './types.js';

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

export function yearRecapSelection(year: number, now = new Date()): RecapSelection {
  const start = localDate(year, 0, 1);
  const boundary = localDate(year + 1, 0, 1);
  const complete = now.getTime() >= boundary.getTime();
  return { kind: 'year', start: iso(start), end: iso(complete ? boundary : now), label: String(year), complete };
}

export function seasonRecapSelection(year: number, season: 'Winter' | 'Spring' | 'Summer' | 'Fall', now = new Date()): RecapSelection {
  const ranges = { Winter: [0, 2], Spring: [2, 5], Summer: [5, 8], Fall: [8, 11] } as const;
  const [startMonth, endMonth] = ranges[season];
  const start = localDate(year, startMonth, 1);
  const boundary = localDate(year, endMonth, 1);
  const complete = now.getTime() >= boundary.getTime();
  return { kind: 'season', start: iso(start), end: iso(complete ? boundary : now), label: `${season} ${year}`, complete };
}

export function customRecapSelection(startDay: string, endDay: string): RecapSelection {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error('Choose a valid date range.');
    return localDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  const start = parse(startDay);
  const endInclusive = parse(endDay);
  const end = localDate(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate() + 1);
  if (end <= start) throw new Error('The custom recap must end after it starts.');
  return {
    kind: 'custom', start: iso(start), end: iso(end),
    label: `${monthName(start.getMonth(), 'short')} ${start.getDate()} to ${monthName(endInclusive.getMonth(), 'short')} ${endInclusive.getDate()}`,
    complete: end.getTime() <= Date.now(),
  };
}
