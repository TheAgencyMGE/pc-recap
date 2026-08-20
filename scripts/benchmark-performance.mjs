import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ActivityRepository } from '../dist/main/database.js';
import { createNodeMetricProvider, SystemPerformanceSampler } from '../dist/main/performance/system-sampler.js';

const SAMPLE_ITERATIONS = 250;
const DATABASE_WRITES = 1_000;
const DEFAULT_INTERVAL_SECONDS = 10;
const RAW_RETENTION_DAYS = 7;
const databaseDirectory = await mkdtemp(join(tmpdir(), 'pc-recap-benchmark-'));
const databasePath = join(databaseDirectory, 'benchmark.db');
const sampler = new SystemPerformanceSampler(createNodeMetricProvider());
const repository = new ActivityRepository(databasePath);

try {
  await sampler.sample();
  const rssBefore = process.memoryUsage().rss;
  const cpuBefore = process.cpuUsage();
  const samplingStarted = performance.now();
  for (let iteration = 0; iteration < SAMPLE_ITERATIONS; iteration += 1) await sampler.sample();
  const samplingElapsedMs = performance.now() - samplingStarted;
  const samplingCpu = process.cpuUsage(cpuBefore);

  const writeStarted = performance.now();
  const epoch = Date.UTC(2026, 0, 1);
  for (let index = 0; index < DATABASE_WRITES; index += 1) {
    repository.insertPerformanceSample({
      id: `benchmark-${index}`,
      sampledAt: new Date(epoch + index * DEFAULT_INTERVAL_SECONDS * 1_000).toISOString(),
      machineId: 'benchmark-machine',
      intervalSeconds: DEFAULT_INTERVAL_SECONDS,
      cpuPercent: 15 + (index % 70),
      memoryUsedBytes: 8_000_000_000 + index * 1_024,
      memoryAvailableBytes: 8_000_000_000 - index * 1_024,
      memoryTotalBytes: 16_000_000_000,
      memoryPercent: 50 + (index % 20) / 10,
      uptimeSeconds: index * DEFAULT_INTERVAL_SECONDS,
      powerState: 'ac',
      foregroundAppId: index % 2 ? 'code' : 'chrome',
      foregroundAppName: index % 2 ? 'Visual Studio Code' : 'Chrome',
    });
  }
  const writeElapsedMs = performance.now() - writeStarted;
  repository.close();
  const databaseBytes = (await stat(databasePath)).size;

  const idleCpuBefore = process.cpuUsage();
  const idleStarted = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const idleElapsedMs = performance.now() - idleStarted;
  const idleCpu = process.cpuUsage(idleCpuBefore);
  const idleCpuMs = (idleCpu.user + idleCpu.system) / 1_000;
  const rssAfter = process.memoryUsage().rss;

  const report = {
    environment: { platform: process.platform, architecture: process.arch, node: process.versions.node, electron: process.versions.electron ?? null },
    methodology: {
      samplingIterations: SAMPLE_ITERATIONS,
      databaseWrites: DATABASE_WRITES,
      idleObservationSeconds: Number((idleElapsedMs / 1_000).toFixed(2)),
      defaultCollectionIntervalSeconds: DEFAULT_INTERVAL_SECONDS,
      expectedRawWritesPerDay: Math.round(86_400 / DEFAULT_INTERVAL_SECONDS),
      rawRetentionDays: RAW_RETENTION_DAYS,
    },
    results: {
      averageSamplerLatencyMs: Number((samplingElapsedMs / SAMPLE_ITERATIONS).toFixed(3)),
      samplerCpuMs: Number(((samplingCpu.user + samplingCpu.system) / 1_000).toFixed(2)),
      averageDatabaseWriteMs: Number((writeElapsedMs / DATABASE_WRITES).toFixed(3)),
      databaseBytesFor1000SamplesAndRollups: databaseBytes,
      approximateBytesPerRawWriteIncludingRollups: Number((databaseBytes / DATABASE_WRITES).toFixed(1)),
      processRssBeforeMb: Number((rssBefore / 1024 ** 2).toFixed(1)),
      processRssAfterMb: Number((rssAfter / 1024 ** 2).toFixed(1)),
      idleCpuPercentOfOneCore: Number(((idleCpuMs / idleElapsedMs) * 100).toFixed(3)),
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  try { repository.close(); } catch { /* Already closed after the measurement. */ }
  await rm(databaseDirectory, { recursive: true, force: true });
}
