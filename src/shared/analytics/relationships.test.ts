import { describe, expect, it } from 'vitest';
import { buildRelationships, detectRoutines } from './relationships';
import type { ActivitySession } from '../types';

const session = (id: string, appName: string, startedAt: string, seconds = 300): ActivitySession => ({
  id, appId: appName.toLowerCase(), appName, categoryId: 'work', startedAt,
  endedAt: new Date(new Date(startedAt).getTime() + seconds * 1_000).toISOString(), durationSeconds: seconds,
});

describe('temporal relationships', () => {
  const sessions = [
    session('1', 'Chrome', '2026-08-10T09:00:00.000Z'),
    session('2', 'Code', '2026-08-10T09:05:00.000Z'),
    session('3', 'Chrome', '2026-08-10T09:10:00.000Z'),
    session('4', 'Chrome', '2026-08-11T09:00:00.000Z'),
    session('5', 'Code', '2026-08-11T09:05:00.000Z'),
    session('6', 'Chrome', '2026-08-11T09:10:00.000Z'),
  ];

  it('counts adjacent app switches instead of mere same-day co-occurrence', () => {
    expect(buildRelationships(sessions)[0]).toMatchObject({
      appA: 'Chrome', appB: 'Code', transitions: 4, distinctDays: 2, direction: 'balanced',
    });
  });

  it('only names routines that repeat on multiple days', () => {
    expect(detectRoutines(sessions)[0]).toMatchObject({ apps: ['Chrome', 'Code', 'Chrome'], occurrences: 2, distinctDays: 2 });
  });
});
