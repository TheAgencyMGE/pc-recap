// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { AnalyticsService } from './analytics-service';
import { ActivityRepository } from './database';
import type { LiveActivitySession } from '../shared/types';

const repositories: ActivityRepository[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
});

describe('AnalyticsService local calendar semantics', () => {
  it('finds On This Day memories and favorite hours by the computer local clock', () => {
    const repository = new ActivityRepository(':memory:');
    repositories.push(repository);
    const activityStart = new Date(2024, 0, 15, 20, 0);
    repository.insertSession({
      id: 'evening-session',
      appId: 'obsidian',
      appName: 'Obsidian',
      categoryId: 'work',
      startedAt: activityStart.toISOString(),
      endedAt: new Date(activityStart.getTime() + 1_800_000).toISOString(),
      durationSeconds: 1_800,
    });
    const service = new AnalyticsService(
      repository,
      () => ({ state: 'tracking' }),
      () => new Date(2026, 0, 15, 12, 0),
    );

    expect(service.getOnThisDay()).toEqual([
      expect.objectContaining({ year: 2024, topApp: 'Obsidian', totalSeconds: 1_800 }),
    ]);
    expect(service.getAppDetail('obsidian')).toMatchObject({ favoriteHour: 20, activeDays: 1 });
  });

  it('includes an open provisional session exactly once in the current summary', () => {
    const repository = new ActivityRepository(':memory:');
    repositories.push(repository);
    const live: LiveActivitySession = {
      id: 'live-code', appId: 'code', appName: 'Visual Studio Code', categoryId: 'coding',
      startedAt: '2026-08-15T10:00:00.000Z', endedAt: '2026-08-15T10:02:00.000Z',
      durationSeconds: 120, machineId: 'desktop', provisional: true,
    };
    const service = new AnalyticsService(
      repository,
      () => ({ state: 'tracking' }),
      () => new Date('2026-08-15T10:02:00.000Z'),
      () => live,
    );

    expect(service.getSummary('today')).toMatchObject({ totalSeconds: 120, sessionCount: 1 });
    repository.insertSession(live);
    expect(service.getSummary('today')).toMatchObject({ totalSeconds: 120, sessionCount: 1 });
  });
});
