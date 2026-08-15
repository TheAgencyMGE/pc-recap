import { describe, expect, it } from 'vitest';
import { getPeriodRange, seasonRecapSelection } from './periods';

describe('getPeriodRange', () => {
  it('starts weeks on Monday at local midnight', () => {
    const range = getPeriodRange('week', new Date(2025, 4, 8, 12));

    expect(range.label).toBe('May 5–11');
    expect(localParts(range.start)).toEqual([2025, 5, 5, 0, 0]);
    expect(localParts(range.end)).toEqual([2025, 5, 8, 12, 0]);
    expect(localParts(range.previousStart)).toEqual([2025, 4, 28, 0, 0]);
    expect(localParts(range.previousEnd)).toEqual([2025, 5, 1, 12, 0]);
    expect(range).toMatchObject({ isComplete: false, comparisonLabel: 'Same time last week' });
  });

  it('uses the selected local calendar year for yearly recaps', () => {
    const range = getPeriodRange('year', new Date(2025, 4, 8, 12), 2023);

    expect(range.label).toBe('2023');
    expect(localParts(range.start)).toEqual([2023, 1, 1, 0, 0]);
    expect(localParts(range.end)).toEqual([2024, 1, 1, 0, 0]);
    expect(localParts(range.previousStart)).toEqual([2022, 1, 1, 0, 0]);
    expect(localParts(range.previousEnd)).toEqual([2023, 1, 1, 0, 0]);
    expect(range.isComplete).toBe(true);
  });

  it('uses the computer local date for Today', () => {
    const range = getPeriodRange('today', new Date(2025, 11, 31, 23, 45));

    expect(localParts(range.start)).toEqual([2025, 12, 31, 0, 0]);
    expect(localParts(range.end)).toEqual([2025, 12, 31, 23, 45]);
    expect(localParts(range.previousEnd)).toEqual([2025, 12, 30, 23, 45]);
  });

  it('defines winter across December through February', () => {
    const selection = seasonRecapSelection(2025, 'Winter', new Date(2026, 2, 10));
    expect(localParts(selection.start)).toEqual([2025, 12, 1, 0, 0]);
    expect(localParts(selection.end)).toEqual([2026, 3, 1, 0, 0]);
    expect(selection.label).toBe('Winter 2025–26');
  });

  it('ends all-time coverage at now instead of a future year boundary', () => {
    const now = new Date(2026, 7, 15, 12, 30);
    expect(getPeriodRange('all-time', now).end).toBe(now.toISOString());
  });
});

function localParts(value: string) {
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
}
