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
    const currentStart = new Date(2026, 0, 15, 21, 0);
    repository.insertSession({
      id: 'current-year-session', appId: 'discord', appName: 'Discord', categoryId: 'social',
      startedAt: currentStart.toISOString(), endedAt: new Date(currentStart.getTime() + 600_000).toISOString(),
      durationSeconds: 600,
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

  it('unlocks seven active days at the seventh day instead of the first session', () => {
    const repository = new ActivityRepository(':memory:');
    repositories.push(repository);
    for (let day = 1; day <= 7; day += 1) {
      const startedAt = `2026-08-${String(day).padStart(2, '0')}T09:00:00.000Z`;
      repository.insertSession({
        id: `day-${day}`, appId: 'code', appName: 'Code', categoryId: 'coding', startedAt,
        endedAt: `2026-08-${String(day).padStart(2, '0')}T10:00:00.000Z`, durationSeconds: 3_600,
      });
    }
    const service = new AnalyticsService(repository, () => ({ state: 'tracking' }));

    expect(service.getAchievements().find((item) => item.id === 'week-in-life')?.unlockedAt)
      .toBe('2026-08-07T09:00:00.000Z');
    expect(repository.getAchievementUnlock('week-in-life')).toBe('2026-08-07T09:00:00.000Z');
  });

  it('builds a chronological Day Replay with local-clock facts and clues', () => {
    const repository = new ActivityRepository(':memory:');
    repositories.push(repository);
    repository.insertSession({
      id: 'chrome-morning', appId: 'chrome', appName: 'Chrome', categoryId: 'browsing',
      startedAt: new Date(2026, 7, 15, 9, 0).toISOString(), endedAt: new Date(2026, 7, 15, 9, 30).toISOString(), durationSeconds: 1_800,
    });
    repository.insertSession({
      id: 'code-morning', appId: 'code', appName: 'Visual Studio Code', categoryId: 'coding',
      startedAt: new Date(2026, 7, 15, 10, 0).toISOString(), endedAt: new Date(2026, 7, 15, 11, 0).toISOString(), durationSeconds: 3_600,
    });
    repository.commitHistoryBatch({
      batch: { id: 'day-clue-batch', sourceKind: 'windows_recovery', sourceFingerprint: 'day-clue', importedAt: new Date(2026, 7, 15, 12).toISOString(), exactSessionCount: 0, recoveredEventCount: 1 },
      sessions: [],
      recoveredEvents: [{ id: 'day-clue', appName: 'Blender', eventType: 'installed', occurredAt: new Date(2026, 7, 15, 12).toISOString(), sourceKind: 'windows_installed_apps', confidence: 'medium', importBatchId: 'day-clue-batch' }],
    });
    repository.saveMemoryPin({
      id: 'day-pin', title: 'First beta', note: '', start: new Date(2026, 7, 15).toISOString(), end: new Date(2026, 7, 16).toISOString(),
      color: '#4256f4', includeInRecaps: false, createdAt: new Date(2026, 7, 15).toISOString(), updatedAt: new Date(2026, 7, 15).toISOString(),
    });
    const service = new AnalyticsService(repository, () => ({ state: 'tracking' }), () => new Date(2026, 7, 15, 13));

    const result = service.getDayReplay('2026-08-15');

    expect(result).toMatchObject({
      day: '2026-08-15', firstActivity: new Date(2026, 7, 15, 9).toISOString(), busiestHour: 10,
      appSwitches: 1,
    });
    expect(result.segments.map((segment) => segment.appName)).toEqual(['Chrome', 'Visual Studio Code']);
    expect(result.idleGaps[0]).toMatchObject({ durationSeconds: 1_800 });
    expect(result.recoveredClues).toEqual([expect.objectContaining({ appName: 'Blender' })]);
    expect(result.pins).toEqual([expect.objectContaining({ title: 'First beta' })]);
  });

  it('builds custom recap stories from only the selected real interval', () => {
    const repository = new ActivityRepository(':memory:');
    repositories.push(repository);
    repository.insertSession({
      id: 'inside-custom', appId: 'code', appName: 'Code', categoryId: 'coding',
      startedAt: '2026-06-10T10:00:00.000Z', endedAt: '2026-06-10T11:00:00.000Z', durationSeconds: 3_600,
    });
    repository.insertSession({
      id: 'outside-custom', appId: 'chrome', appName: 'Chrome', categoryId: 'browsing',
      startedAt: '2026-07-10T10:00:00.000Z', endedAt: '2026-07-10T12:00:00.000Z', durationSeconds: 7_200,
    });
    const service = new AnalyticsService(repository, () => ({ state: 'tracking' }));

    const story = service.getRecap({
      kind: 'custom', start: '2026-06-01T00:00:00.000Z', end: '2026-07-01T00:00:00.000Z', label: 'June cut', complete: true,
    });

    expect(story.summary).toMatchObject({ totalSeconds: 3_600, label: 'June cut' });
    expect(story.summary.topApps.map((app) => app.name)).toEqual(['Code']);
    expect(story.timeline).toEqual([expect.objectContaining({ key: '2026-06', topApp: 'Code' })]);
  });
});
