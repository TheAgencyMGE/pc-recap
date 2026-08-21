import { randomUUID } from 'node:crypto';
import type { SystemPerformanceSample } from '../../shared/types.js';
import type { ActivityRepository } from '../database.js';

interface PerformanceSampler {
  sample(at: Date): Promise<SystemPerformanceSample>;
}

interface PerformanceTrackerOptions {
  now?: () => Date;
  machineId?: string;
  getForegroundSession?: () => { appId: string; appName: string } | undefined;
  rawRetentionDays?: number;
}

export class PerformanceTracker {
  private readonly now: () => Date;
  private readonly machineId: string;
  private readonly getForegroundSession: () => { appId: string; appName: string } | undefined;
  private readonly rawRetentionDays: number;
  private timer?: ReturnType<typeof setInterval>;
  private timerIntervalMs?: number;
  private running = false;
  private samplePromise?: Promise<void>;
  private latestSuccessfulSampleAt?: string;
  private lastError?: string;
  private storedSamples = 0;
  private generation = 0;
  private resumeAfterEraseRequested = false;

  constructor(
    private readonly repository: ActivityRepository,
    private readonly sampler: PerformanceSampler,
    options: PerformanceTrackerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.machineId = options.machineId ?? 'local';
    this.getForegroundSession = options.getForegroundSession ?? (() => undefined);
    this.rawRetentionDays = Math.max(1, Math.min(31, options.rawRetentionDays ?? 7));
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.sample();
    this.scheduleTimer(this.repository.getSettings().performanceSampleIntervalSeconds * 1_000);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.timerIntervalMs = undefined;
  }

  async sample() {
    if (this.samplePromise) return this.samplePromise;
    const task = this.performSample(this.generation);
    this.samplePromise = task;
    try { await task; } finally { if (this.samplePromise === task) this.samplePromise = undefined; }
  }

  getLatestSuccessfulSampleAt() {
    return this.latestSuccessfulSampleAt;
  }

  getLastError() {
    return this.lastError;
  }

  async suspendForErase() {
    this.resumeAfterEraseRequested = this.running;
    this.running = false;
    this.generation += 1;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.timerIntervalMs = undefined;
    await this.samplePromise;
  }

  async resumeAfterErase() {
    if (!this.resumeAfterEraseRequested) return;
    this.resumeAfterEraseRequested = false;
    this.running = true;
    await this.sample();
    this.scheduleTimer(this.repository.getSettings().performanceSampleIntervalSeconds * 1_000);
  }

  private async performSample(generation: number) {
    const settings = this.repository.getSettings();
    if (this.running) this.scheduleTimer(settings.performanceSampleIntervalSeconds * 1_000);
    if (!settings.performanceHistoryEnabled) return;
    const at = this.now();
    try {
      const measured = await this.sampler.sample(at);
      if (generation !== this.generation) return;
      const foreground = this.getForegroundSession();
      const sample: SystemPerformanceSample = {
        ...measured,
        id: randomUUID(),
        sampledAt: at.toISOString(),
        machineId: this.machineId,
        intervalSeconds: settings.performanceSampleIntervalSeconds,
        foregroundAppId: foreground?.appId,
        foregroundAppName: foreground?.appName,
      };
      this.repository.insertPerformanceSample(sample);
      this.latestSuccessfulSampleAt = sample.sampledAt;
      this.lastError = undefined;
      this.storedSamples += 1;
      if (this.storedSamples % 60 === 0) {
        this.repository.prunePerformanceSamples(new Date(
          at.getTime() - this.rawRetentionDays * 24 * 60 * 60 * 1_000,
        ).toISOString());
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Performance sampling failed.';
    }
  }

  private scheduleTimer(intervalMs: number) {
    if (this.timer && this.timerIntervalMs === intervalMs) return;
    if (this.timer) clearInterval(this.timer);
    this.timerIntervalMs = intervalMs;
    this.timer = setInterval(() => void this.sample(), intervalMs);
    this.timer.unref?.();
  }
}
