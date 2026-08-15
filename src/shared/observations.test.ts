import { describe, expect, it } from 'vitest';
import { generateObservations } from './observations';
import type { PeriodSummary } from './types';

const summary: PeriodSummary = {
  kind: 'week',
  label: 'This week',
  rangeStart: '2025-01-01T00:00:00.000Z',
  rangeEnd: '2025-01-08T00:00:00.000Z',
  isComplete: true,
  comparisonLabel: 'Last week',
  totalSeconds: 36_000,
  previousTotalSeconds: 30_000,
  changePercent: 20,
  firstActivity: '2025-01-01T08:12:00.000Z',
  lastActivity: '2025-01-03T02:17:00.000Z',
  longestSession: {
    id: 'long', appId: 'minecraft', appName: 'Minecraft', categoryId: 'gaming',
    startedAt: '2025-01-02T20:00:00.000Z', endedAt: '2025-01-02T22:00:00.000Z', durationSeconds: 7_200,
  },
  topApps: [
    { appId: 'minecraft', name: 'Minecraft', categoryId: 'gaming', seconds: 18_000, sessions: 3, share: 50, color: '#75C46B', changePercent: 41 },
    { appId: 'discord', name: 'Discord', categoryId: 'social', seconds: 10_000, sessions: 4, share: 27.8, color: '#8D87FF' },
  ],
  categories: [],
  hourly: Array.from({ length: 24 }, (_, hour) => ({ label: String(hour), seconds: hour === 2 ? 8_000 : 0 })),
  daily: [],
  appPairs: [{ appA: 'Chrome', appB: 'VS Code', daysTogether: 5, score: 5 }],
  relationships: [{ appA: 'Chrome', appB: 'VS Code', transitions: 8, distinctDays: 5, medianGapSeconds: 30, direction: 'balanced', score: 40 }],
  routines: [],
  baselines: { activeDays: 3, averageDailySeconds: 12_000, medianDailySeconds: 12_000, busiestWeekday: 3, typicalFirstHour: 8, typicalLastHour: 22, nightSeconds: 8_000 },
  lifecycle: [],
  eras: [],
  observations: [],
  records: [],
  sessionCount: 7,
  activeDays: 3,
};

describe('generateObservations', () => {
  it('is deterministic and prioritizes the late-night app fact', () => {
    const first = generateObservations(summary);
    const second = generateObservations(summary);

    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({
      id: 'night-owl',
      text: 'Your 2 AM app was Discord.',
    });
  });

  it('includes exact period growth and power-couple copy', () => {
    const result = generateObservations(summary);

    expect(result.map((item) => item.text)).toContain('Minecraft usage increased 41% this week.');
    expect(result.map((item) => item.text)).toContain('Chrome + VS Code were your power couple.');
  });

  it('does not sensationalize a percentage built on a tiny baseline', () => {
    const observations = generateObservations({
      ...summary,
      hourly: summary.hourly.map((bucket) => ({ ...bucket, seconds: 0 })),
      hourlyApps: {},
      topApps: [{
        appId: 'blender', name: 'Blender', categoryId: 'creative', seconds: 1_868,
        previousSeconds: 120, sessions: 2, share: 100, color: '#F08CC6', changePercent: 1_457,
      }],
      appPairs: [],
      relationships: [],
      longestSession: undefined,
    });

    expect(observations.some((item) => item.text.includes('1457%'))).toBe(false);
    expect(observations.some((item) => item.text.includes('2 minutes') && item.text.includes('31 minutes'))).toBe(true);
  });

  it('uses relationship facts for the same unordered pair', () => {
    const result = generateObservations({
      ...summary,
      relationships: [
        { appA: 'Discord', appB: 'Spotify', transitions: 99, distinctDays: 8, medianGapSeconds: 10, direction: 'balanced', score: 80 },
        { appA: 'VS Code', appB: 'Chrome', transitions: 12, distinctDays: 5, medianGapSeconds: 20, direction: 'balanced', score: 50 },
      ],
    });

    expect(result.find((item) => item.id.startsWith('pair-'))?.detail).toContain('12 times across 5 days');
  });
});
