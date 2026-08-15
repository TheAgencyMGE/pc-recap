import { describe, expect, it } from 'vitest';
import { buildBaselines } from './baselines';
import type { ActivitySession } from '../types';

const session = (id: string, startedAt: string, seconds: number): ActivitySession => ({
  id, appId: 'code', appName: 'Code', categoryId: 'coding', startedAt,
  endedAt: new Date(new Date(startedAt).getTime() + seconds * 1_000).toISOString(), durationSeconds: seconds,
});

describe('buildBaselines', () => {
  it('describes a normal active day using real local-day totals', () => {
    const result = buildBaselines([
      session('a', '2026-08-10T09:00:00.000Z', 7_200),
      session('b', '2026-08-11T10:00:00.000Z', 7_200),
    ]);

    expect(result).toMatchObject({ averageDailySeconds: 7_200, medianDailySeconds: 7_200, activeDays: 2 });
  });
});
