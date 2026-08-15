import { describe, expect, it } from 'vitest';
import { formatBucketLabel, formatDuration, formatDurationLong, formatHour } from './format';

describe('human-readable formatting', () => {
  it('does not turn short real activity into zero minutes', () => {
    expect(formatDuration(30)).toBe('<1m');
    expect(formatDurationLong(30)).toBe('30 seconds');
  });

  it('uses familiar twelve-hour clock labels', () => {
    expect(formatHour(0)).toBe('12 AM');
    expect(formatBucketLabel('hour', '13')).toBe('1 PM');
  });

  it('adds calendar context to day and month buckets', () => {
    expect(formatBucketLabel('day', '2026-08-15')).toBe('Sat, Aug 15');
    expect(formatBucketLabel('month', '2026-08')).toBe('Aug 2026');
  });

  it('spells out long durations for explanatory copy', () => {
    expect(formatDurationLong(3_661)).toBe('1 hour 1 minute');
  });
});
