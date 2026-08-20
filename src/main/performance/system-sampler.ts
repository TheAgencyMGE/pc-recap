import { cpus, freemem, totalmem, uptime } from 'node:os';
import type { PerformanceCapabilities, SystemPerformanceSample } from '../../shared/types.js';

export interface CpuTimeSnapshot {
  idle: number;
  total: number;
}

export interface PowerSnapshot {
  batteryPercent?: number;
  powerState?: SystemPerformanceSample['powerState'];
  thermalState?: SystemPerformanceSample['thermalState'];
}

export interface SystemMetricProvider {
  cpuTimes: () => CpuTimeSnapshot[];
  totalMemoryBytes: () => number;
  freeMemoryBytes: () => number;
  uptimeSeconds: () => number;
  power?: () => Promise<PowerSnapshot>;
}

export function createNodeMetricProvider(power?: SystemMetricProvider['power']): SystemMetricProvider {
  return {
    cpuTimes: () => cpus().map(({ times }) => ({
      idle: times.idle,
      total: times.user + times.nice + times.sys + times.idle + times.irq,
    })),
    totalMemoryBytes: totalmem,
    freeMemoryBytes: freemem,
    uptimeSeconds: uptime,
    power,
  };
}

export class SystemPerformanceSampler {
  private previousCpu?: CpuTimeSnapshot[];

  constructor(private readonly provider: SystemMetricProvider = createNodeMetricProvider()) {}

  async sample(at = new Date()): Promise<SystemPerformanceSample> {
    const cpu = this.safeCpuSnapshot();
    const cpuPercent = this.cpuPercent(cpu);
    this.previousCpu = cpu;
    const memoryTotalBytes = positiveFinite(this.provider.totalMemoryBytes());
    const memoryAvailableBytes = nonNegativeFinite(this.provider.freeMemoryBytes());
    const memoryUsedBytes = memoryTotalBytes !== undefined && memoryAvailableBytes !== undefined
      ? Math.max(0, Math.min(memoryTotalBytes, memoryTotalBytes - memoryAvailableBytes))
      : undefined;
    const memoryPercent = memoryUsedBytes !== undefined && memoryTotalBytes
      ? boundedPercent((memoryUsedBytes / memoryTotalBytes) * 100)
      : undefined;
    let power: PowerSnapshot = {};
    try { power = await this.provider.power?.() ?? {}; } catch { /* Capability remains unavailable. */ }
    return compactSample({
      sampledAt: at.toISOString(),
      cpuPercent,
      memoryUsedBytes,
      memoryAvailableBytes: memoryTotalBytes !== undefined && memoryAvailableBytes !== undefined
        ? Math.min(memoryTotalBytes, memoryAvailableBytes)
        : undefined,
      memoryTotalBytes,
      memoryPercent,
      uptimeSeconds: nonNegativeFinite(this.provider.uptimeSeconds()),
      batteryPercent: boundedPercent(power.batteryPercent),
      powerState: validPowerState(power.powerState),
      thermalState: validThermalState(power.thermalState),
    });
  }

  getCapabilities(sample: SystemPerformanceSample): PerformanceCapabilities {
    return {
      cpu: sample.cpuPercent !== undefined || Boolean(this.previousCpu?.length),
      memory: sample.memoryPercent !== undefined,
      uptime: sample.uptimeSeconds !== undefined,
      battery: sample.batteryPercent !== undefined,
      powerState: sample.powerState !== undefined,
      gpu: sample.gpuPercent !== undefined,
      gpuMemory: sample.gpuMemoryUsedBytes !== undefined,
      diskActivity: sample.diskReadBytesPerSecond !== undefined || sample.diskWriteBytesPerSecond !== undefined,
      thermalState: sample.thermalState !== undefined,
    };
  }

  private safeCpuSnapshot() {
    try {
      return this.provider.cpuTimes().filter((item) => Number.isFinite(item.idle) && item.idle >= 0 && Number.isFinite(item.total) && item.total >= item.idle);
    } catch {
      return [];
    }
  }

  private cpuPercent(current: CpuTimeSnapshot[]) {
    if (!this.previousCpu?.length || current.length !== this.previousCpu.length || !current.length) return undefined;
    let idleDelta = 0;
    let totalDelta = 0;
    for (let index = 0; index < current.length; index += 1) {
      const idle = current[index].idle - this.previousCpu[index].idle;
      const total = current[index].total - this.previousCpu[index].total;
      if (!Number.isFinite(idle) || !Number.isFinite(total) || idle < 0 || total <= 0 || idle > total) return undefined;
      idleDelta += idle;
      totalDelta += total;
    }
    return totalDelta > 0 ? boundedPercent((1 - idleDelta / totalDelta) * 100) : undefined;
  }
}

function compactSample<T extends SystemPerformanceSample>(sample: T): T {
  return Object.fromEntries(Object.entries(sample).filter(([, value]) => value !== undefined)) as T;
}

function boundedPercent(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? Number(value.toFixed(1))
    : undefined;
}

function positiveFinite(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function nonNegativeFinite(value: number) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function validPowerState(value: SystemPerformanceSample['powerState']) {
  return value && ['ac', 'battery', 'charging', 'unknown'].includes(value) ? value : undefined;
}

function validThermalState(value: SystemPerformanceSample['thermalState']) {
  return value && ['nominal', 'fair', 'serious', 'critical'].includes(value) ? value : undefined;
}
