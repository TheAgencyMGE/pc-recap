import { randomUUID } from 'node:crypto';
import type { ActivitySession, TrackingStatus } from '../shared/types.js';
import type { ActiveWindowInfo, ActivitySource } from './activity-source.js';
import { categoryForApplication } from './activity-source.js';
import type { ActivityRepository } from './database.js';

interface TrackerOptions {
  now?: () => Date;
  idleSeconds?: () => number;
  machineId?: string;
  onStatus?: (status: TrackingStatus) => void;
}

interface OpenSession {
  info: ActiveWindowInfo;
  startedAt: Date;
  lastSampleAt: Date;
}

export class ActivityTracker {
  private readonly now: () => Date;
  private readonly idleSeconds: () => number;
  private readonly machineId: string;
  private readonly onStatus?: (status: TrackingStatus) => void;
  private openSession?: OpenSession;
  private timer?: ReturnType<typeof setInterval>;
  private sampling = false;
  private status: TrackingStatus = { state: 'paused' };

  constructor(
    private readonly repository: ActivityRepository,
    private readonly source: ActivitySource,
    options: TrackerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.idleSeconds = options.idleSeconds ?? (() => 0);
    this.machineId = options.machineId ?? 'local';
    this.onStatus = options.onStatus;
  }

  start() {
    if (this.timer) return;
    const interval = this.repository.getSettings().sampleIntervalSeconds * 1_000;
    void this.sample();
    this.timer = setInterval(() => void this.sample(), interval);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.closeSession(this.now());
    this.setStatus({ state: 'paused' });
    this.source.dispose?.();
  }

  pause() {
    this.repository.updateSettings({ trackingEnabled: false });
    this.closeSession(this.now());
    this.setStatus({ state: 'paused' });
  }

  resume() {
    this.repository.updateSettings({ trackingEnabled: true });
    this.setStatus({ state: 'tracking' });
  }

  getStatus(): TrackingStatus {
    return { ...this.status };
  }

  async sample() {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const settings = this.repository.getSettings();
      const now = this.now();
      if (!settings.trackingEnabled) {
        this.closeSession(now);
        this.setStatus({ state: 'paused' });
        return;
      }
      if (this.idleSeconds() >= settings.idleThresholdSeconds) {
        this.closeSession(now);
        this.setStatus({ state: 'idle', since: now.toISOString() });
        return;
      }
      const active = await this.source.getActiveWindow();
      if (!active) {
        this.closeSession(now);
        this.setStatus({ state: 'unavailable', reason: 'No foreground application was detected.' });
        return;
      }
      const excluded = settings.excludedExecutables.includes(active.executable.toLowerCase())
        || this.repository.isAppExcluded(active.executable);
      if (excluded) {
        this.closeSession(now);
        this.setStatus({ state: 'paused', reason: `${active.name} is excluded from tracking.` });
        return;
      }
      if (this.openSession?.info.executable.toLowerCase() === active.executable.toLowerCase()) {
        this.openSession.lastSampleAt = now;
        if (settings.captureWindowTitles) this.openSession.info.title = active.title;
      } else {
        this.closeSession(now);
        this.openSession = { info: active, startedAt: now, lastSampleAt: now };
      }
      this.setStatus({ state: 'tracking', activeApp: active.name, since: this.openSession.startedAt.toISOString() });
    } catch (error) {
      this.closeSession(this.now());
      this.setStatus({
        state: 'unavailable',
        reason: error instanceof Error ? error.message : 'The activity source is unavailable.',
      });
    } finally {
      this.sampling = false;
    }
  }

  private closeSession(endedAt: Date) {
    if (!this.openSession) return;
    const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - this.openSession.startedAt.getTime()) / 1_000));
    if (durationSeconds > 0) {
      const categoryId = categoryForApplication(this.openSession.info);
      const session: ActivitySession = {
        id: randomUUID(),
        appId: this.openSession.info.executable.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        appName: this.openSession.info.name,
        categoryId,
        startedAt: this.openSession.startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds,
        windowTitle: this.repository.getSettings().captureWindowTitles ? this.openSession.info.title : undefined,
        machineId: this.machineId,
      };
      this.repository.insertSession(session, {
        executable: this.openSession.info.executable,
        path: this.openSession.info.path,
      });
    }
    this.openSession = undefined;
  }

  private setStatus(status: TrackingStatus) {
    this.status = status;
    this.onStatus?.(this.getStatus());
  }
}
