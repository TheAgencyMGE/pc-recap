// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { ActivityRepository } from '../database';
import { PerformanceTracker } from './performance-tracker';

const stores: ActivityRepository[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

describe('PerformanceTracker', () => {
  it('stores a low-frequency sample with honest foreground context', async () => {
    const repository = new ActivityRepository(':memory:');
    stores.push(repository);
    const tracker = new PerformanceTracker(repository, {
      sample: async (at: Date) => ({
        sampledAt: at.toISOString(), cpuPercent: 61, memoryPercent: 70,
        memoryUsedBytes: 7_000, memoryTotalBytes: 10_000, memoryAvailableBytes: 3_000, uptimeSeconds: 500,
      }),
    }, {
      now: () => new Date('2026-08-20T10:00:00.000Z'),
      machineId: 'pc',
      getForegroundSession: () => ({ appId: 'minecraft', appName: 'Minecraft' }),
    });

    await tracker.sample();

    expect(repository.getAllPerformanceSamples()).toEqual([
      expect.objectContaining({
        sampledAt: '2026-08-20T10:00:00.000Z', intervalSeconds: 10, cpuPercent: 61,
        foregroundAppId: 'minecraft', foregroundAppName: 'Minecraft',
      }),
    ]);
    expect(tracker.getLatestSuccessfulSampleAt()).toBe('2026-08-20T10:00:00.000Z');
  });

  it('does not query or store metrics when performance history is disabled', async () => {
    const repository = new ActivityRepository(':memory:');
    stores.push(repository);
    repository.updateSettings({ performanceHistoryEnabled: false });
    let calls = 0;
    const tracker = new PerformanceTracker(repository, {
      sample: async (at: Date) => { calls += 1; return { sampledAt: at.toISOString() }; },
    });

    await tracker.sample();

    expect(calls).toBe(0);
    expect(repository.getAllPerformanceSamples()).toEqual([]);
    expect(tracker.getLatestSuccessfulSampleAt()).toBeUndefined();
  });
});
