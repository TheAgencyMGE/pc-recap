import { randomUUID } from 'node:crypto';
import type { ActivitySession, LiveActivitySession, OpenSessionCheckpoint, TrackingStatus } from '../shared/types.js';
import type { ActiveWindowInfo, ActivitySource } from './activity-source.js';
import { categoryForApplication } from './activity-source.js';
import type { ActivityRepository } from './database.js';
import { idleEndTime, transitionMidpoint } from './tracking/session-math.js';

interface TrackerOptions {
  now?: () => Date;
  idleSeconds?: () => number;
  machineId?: string;
  onStatus?: (status: TrackingStatus) => void;
}

interface OpenSession {
  id: string;
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
  private timerIntervalMs?: number;
  private running = false;
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
    this.recoverCheckpoint();
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.sample();
    this.scheduleTimer(this.repository.getSettings().sampleIntervalSeconds * 1_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.timerIntervalMs = undefined;
    this.running = false;
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
    void this.sample();
    if (this.running) this.scheduleTimer(this.repository.getSettings().sampleIntervalSeconds * 1_000);
  }

  getStatus(): TrackingStatus {
    return { ...this.status };
  }

  getLiveSession(at = this.now()): LiveActivitySession | undefined {
    if (!this.openSession) return undefined;
    const session = this.toSession(this.openSession, at);
    return { ...session, provisional: true };
  }

  async sample() {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const settings = this.repository.getSettings();
      const now = this.now();
      if (this.running) this.scheduleTimer(settings.sampleIntervalSeconds * 1_000);
      if (!settings.trackingEnabled) {
        this.closeSession(now);
        this.setStatus({ state: 'paused' });
        return;
      }
      const idleSeconds = this.idleSeconds();
      if (idleSeconds >= settings.idleThresholdSeconds) {
        this.closeSession(this.openSession ? idleEndTime(now, idleSeconds, this.openSession.startedAt) : now);
        this.setStatus({ state: 'idle', since: now.toISOString() });
        return;
      }
      const active = await this.source.getActiveWindow();
      if (!active) {
        this.closeSession(this.openSession ? transitionMidpoint(this.openSession.lastSampleAt, now) : now);
        this.setStatus({ state: 'unavailable', reason: 'No foreground application was detected.' });
        return;
      }
      const excluded = settings.excludedExecutables.includes(active.executable.toLowerCase())
        || this.repository.isAppExcluded(active.executable);
      if (excluded) {
        this.closeSession(this.openSession ? transitionMidpoint(this.openSession.lastSampleAt, now) : now);
        this.setStatus({ state: 'paused', reason: `${active.name} is excluded from tracking.` });
        return;
      }
      if (this.openSession?.info.executable.toLowerCase() === active.executable.toLowerCase()) {
        this.openSession.lastSampleAt = now;
        if (settings.captureWindowTitles) this.openSession.info.title = active.title;
        this.checkpointOpenSession(now);
      } else {
        const startedAt = this.openSession ? transitionMidpoint(this.openSession.lastSampleAt, now) : now;
        this.closeSession(startedAt);
        this.openSession = { id: randomUUID(), info: active, startedAt, lastSampleAt: now };
        this.checkpointOpenSession(now, true);
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
    const session = this.toSession(this.openSession, endedAt);
    const durationSeconds = session.durationSeconds;
    if (durationSeconds > 0) {
      this.repository.insertSession(session, {
        executable: this.openSession.info.executable,
        path: this.openSession.info.path,
      });
    }
    this.repository.clearOpenSessionCheckpoint(this.machineId);
    this.openSession = undefined;
  }

  private toSession(openSession: OpenSession, endedAt: Date): ActivitySession {
    const safeEnd = new Date(Math.max(openSession.startedAt.getTime(), endedAt.getTime()));
    return {
      id: openSession.id,
      appId: this.appId(openSession.info.executable),
      appName: openSession.info.name,
      categoryId: categoryForApplication(openSession.info),
      startedAt: openSession.startedAt.toISOString(),
      endedAt: safeEnd.toISOString(),
      durationSeconds: Math.max(0, Math.round((safeEnd.getTime() - openSession.startedAt.getTime()) / 1_000)),
      windowTitle: this.repository.getSettings().captureWindowTitles ? openSession.info.title : undefined,
      machineId: this.machineId,
      sourceKind: 'pc_recap',
      confidence: 'recorded',
    };
  }

  private checkpointOpenSession(at: Date, force = false) {
    if (!this.openSession) return;
    const previous = this.repository.getOpenSessionCheckpoint(this.machineId);
    if (!force && previous && at.getTime() - new Date(previous.checkpointedAt).getTime() < 30_000) return;
    this.repository.saveOpenSessionCheckpoint({
      machineId: this.machineId,
      appId: this.appId(this.openSession.info.executable),
      appName: this.openSession.info.name,
      executable: this.openSession.info.executable,
      path: this.openSession.info.path,
      categoryId: categoryForApplication(this.openSession.info),
      startedAt: this.openSession.startedAt.toISOString(),
      lastSampleAt: this.openSession.lastSampleAt.toISOString(),
      checkpointedAt: at.toISOString(),
      windowTitle: this.repository.getSettings().captureWindowTitles ? this.openSession.info.title : undefined,
    });
  }

  private recoverCheckpoint() {
    const checkpoint = this.repository.getOpenSessionCheckpoint(this.machineId);
    if (!checkpoint) return;
    const startedAt = new Date(checkpoint.startedAt);
    const endedAt = new Date(checkpoint.lastSampleAt);
    const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1_000));
    if (durationSeconds > 0) {
      this.repository.insertSession(this.sessionFromCheckpoint(checkpoint, durationSeconds), {
        executable: checkpoint.executable,
        path: checkpoint.path,
      });
    }
    this.repository.clearOpenSessionCheckpoint(this.machineId);
  }

  private sessionFromCheckpoint(checkpoint: OpenSessionCheckpoint, durationSeconds: number): ActivitySession {
    return {
      id: randomUUID(),
      appId: checkpoint.appId,
      appName: checkpoint.appName,
      categoryId: checkpoint.categoryId,
      startedAt: checkpoint.startedAt,
      endedAt: checkpoint.lastSampleAt,
      durationSeconds,
      windowTitle: checkpoint.windowTitle,
      machineId: checkpoint.machineId,
      sourceKind: 'pc_recap',
      confidence: 'recorded',
    };
  }

  private appId(executable: string) {
    return executable.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private scheduleTimer(intervalMs: number) {
    if (this.timer && this.timerIntervalMs === intervalMs) return;
    if (this.timer) clearInterval(this.timer);
    this.timerIntervalMs = intervalMs;
    this.timer = setInterval(() => void this.sample(), intervalMs);
    this.timer.unref?.();
  }

  private setStatus(status: TrackingStatus) {
    this.status = status;
    this.onStatus?.(this.getStatus());
  }
}
