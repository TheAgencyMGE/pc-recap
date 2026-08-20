import type { AppPerformanceRollup, PerformanceRollup, PerformanceSummary, RecordItem } from '../types.js';

export function summarizePerformance(
  rollups: PerformanceRollup[],
  appRollups: AppPerformanceRollup[],
): PerformanceSummary | undefined {
  if (!rollups.length) return undefined;
  const sampleCount = sum(rollups, (item) => item.sampleCount);
  const cpuSampleCount = sum(rollups, (item) => item.cpuSampleCount);
  const memorySampleCount = sum(rollups, (item) => item.memorySampleCount);
  const batteryMetricCount = sum(rollups, (item) => item.batteryMetricCount);
  const batterySamples = sum(rollups, (item) => item.batterySampleCount);
  const pluggedSamples = sum(rollups, (item) => item.acSampleCount + item.chargingSampleCount);
  const powerSamples = batterySamples + pluggedSamples;
  const peakRollup = [...rollups]
    .filter((item) => item.cpuMaximum !== undefined)
    .sort((a, b) => (b.cpuMaximum ?? 0) - (a.cpuMaximum ?? 0) || (a.peakCpuAt ?? a.bucketStart).localeCompare(b.peakCpuAt ?? b.bucketStart))[0];
  const highestLoadContext = combineAppPerformance(appRollups)[0];
  return {
    sampleCount,
    cpuSampleCount,
    cpuAverage: weighted(rollups, (item) => item.cpuAverage, (item) => item.cpuSampleCount),
    cpuPeak: peakRollup?.cpuMaximum,
    cpuPeakAt: peakRollup?.peakCpuAt,
    memorySampleCount,
    memoryPercentAverage: weighted(rollups, (item) => item.memoryPercentAverage, (item) => item.memorySampleCount),
    memoryPercentPeak: maximum(rollups, (item) => item.memoryPercentMaximum),
    memoryUsedAverageBytes: weighted(rollups, (item) => item.memoryUsedAverageBytes, (item) => item.memorySampleCount, true),
    memoryUsedPeakBytes: maximum(rollups, (item) => item.memoryUsedMaximumBytes),
    highLoadSeconds: sum(rollups, (item) => item.highLoadSeconds),
    batteryUsagePercentage: powerSamples ? Math.round((batterySamples / powerSamples) * 100) : undefined,
    pluggedInPercentage: powerSamples ? Math.round((pluggedSamples / powerSamples) * 100) : undefined,
    batteryAverage: batteryMetricCount
      ? weighted(rollups, (item) => item.batteryAverage, (item) => item.batteryMetricCount)
      : undefined,
    highestLoadContext: highestLoadContext ? {
      ...highestLoadContext,
      wording: 'system-load-while-foreground',
    } : undefined,
  };
}

export function performanceRecords(summary: PerformanceSummary): RecordItem[] {
  const records: RecordItem[] = [];
  if (summary.cpuPeak !== undefined && summary.cpuPeakAt) {
    records.push({
      id: 'highest-cpu',
      label: 'Highest recorded CPU load',
      value: `${Math.round(summary.cpuPeak)}%`,
      detail: 'System CPU load at the recorded peak.',
      achievedAt: summary.cpuPeakAt,
      icon: 'cpu',
    });
  }
  return records;
}

function combineAppPerformance(rollups: AppPerformanceRollup[]) {
  const combined = new Map<string, {
    appId: string; appName: string; sampleCount: number; cpuCount: number; cpuSum: number;
    cpuPeak?: number; memoryCount: number; memorySum: number; memoryPeak?: number; highLoadSeconds: number;
  }>();
  for (const item of rollups) {
    const value = combined.get(item.appId) ?? {
      appId: item.appId, appName: item.appName, sampleCount: 0, cpuCount: 0, cpuSum: 0,
      memoryCount: 0, memorySum: 0, highLoadSeconds: 0,
    };
    value.appName = item.appName;
    value.sampleCount += item.sampleCount;
    value.cpuCount += item.cpuSampleCount;
    value.cpuSum += (item.cpuAverage ?? 0) * item.cpuSampleCount;
    value.cpuPeak = maxOptional(value.cpuPeak, item.cpuMaximum);
    value.memoryCount += item.memorySampleCount;
    value.memorySum += (item.memoryPercentAverage ?? 0) * item.memorySampleCount;
    value.memoryPeak = maxOptional(value.memoryPeak, item.memoryPercentMaximum);
    value.highLoadSeconds += item.highLoadSeconds;
    combined.set(item.appId, value);
  }
  return [...combined.values()].map((item) => ({
    appId: item.appId,
    appName: item.appName,
    sampleCount: item.sampleCount,
    cpuAverage: item.cpuCount ? round(item.cpuSum / item.cpuCount) : undefined,
    cpuPeak: item.cpuPeak,
    memoryPercentAverage: item.memoryCount ? round(item.memorySum / item.memoryCount) : undefined,
    memoryPercentPeak: item.memoryPeak,
    highLoadSeconds: item.highLoadSeconds,
  })).sort((a, b) => b.highLoadSeconds - a.highLoadSeconds
    || (b.cpuAverage ?? -1) - (a.cpuAverage ?? -1)
    || b.sampleCount - a.sampleCount
    || a.appName.localeCompare(b.appName));
}

function weighted<T>(items: T[], value: (item: T) => number | undefined, count: (item: T) => number, integer = false) {
  let total = 0;
  let samples = 0;
  for (const item of items) {
    const metric = value(item);
    const metricCount = count(item);
    if (metric === undefined || metricCount <= 0) continue;
    total += metric * metricCount;
    samples += metricCount;
  }
  if (!samples) return undefined;
  return integer ? Math.round(total / samples) : round(total / samples);
}

function maximum<T>(items: T[], value: (item: T) => number | undefined) {
  const values = items.map(value).filter((item): item is number => item !== undefined);
  return values.length ? Math.max(...values) : undefined;
}

function sum<T>(items: T[], value: (item: T) => number) {
  return items.reduce((total, item) => total + value(item), 0);
}

function maxOptional(a: number | undefined, b: number | undefined) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function round(value: number) {
  return Number(value.toFixed(1));
}
