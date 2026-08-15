import { describe, expect, it } from 'vitest';
import { getPeriodRange } from './periods';

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
});

function localParts(value: string) {
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
}
