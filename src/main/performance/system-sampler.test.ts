// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SystemPerformanceSampler } from './system-sampler';

describe('SystemPerformanceSampler', () => {
  it('derives bounded CPU usage and reports memory/uptime without invented optional metrics', async () => {
    const cpuSnapshots = [
      [{ idle: 600, total: 1_000 }, { idle: 500, total: 1_000 }],
      [{ idle: 700, total: 1_200 }, { idle: 600, total: 1_200 }],
    ];
    const sampler = new SystemPerformanceSampler({
      cpuTimes: () => cpuSnapshots.shift()!,
      totalMemoryBytes: () => 16 * 1024 ** 3,
      freeMemoryBytes: () => 4 * 1024 ** 3,
      uptimeSeconds: () => 12_345,
    });

    const first = await sampler.sample(new Date('2026-08-20T10:00:00.000Z'));
    const second = await sampler.sample(new Date('2026-08-20T10:00:10.000Z'));

    expect(first.cpuPercent).toBeUndefined();
    expect(second).toMatchObject({
      cpuPercent: 50,
      memoryTotalBytes: 16 * 1024 ** 3,
      memoryUsedBytes: 12 * 1024 ** 3,
      memoryAvailableBytes: 4 * 1024 ** 3,
      memoryPercent: 75,
      uptimeSeconds: 12_345,
    });
    expect(second.batteryPercent).toBeUndefined();
    expect(second.gpuPercent).toBeUndefined();
    expect(second.thermalState).toBeUndefined();
  });

  it('rejects malformed metric values instead of displaying them as zero', async () => {
    const sampler = new SystemPerformanceSampler({
      cpuTimes: () => [{ idle: Number.NaN, total: -1 }],
      totalMemoryBytes: () => -1,
      freeMemoryBytes: () => Number.NaN,
      uptimeSeconds: () => Number.POSITIVE_INFINITY,
    });

    await sampler.sample(new Date('2026-08-20T10:00:00.000Z'));
    const sample = await sampler.sample(new Date('2026-08-20T10:00:10.000Z'));
    expect(sample).toMatchObject({ sampledAt: '2026-08-20T10:00:10.000Z' });
    expect(sample.cpuPercent).toBeUndefined();
    expect(sample.memoryPercent).toBeUndefined();
    expect(sample.uptimeSeconds).toBeUndefined();
  });
});
