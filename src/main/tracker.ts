import { randomUUID } from 'node:crypto';
import type {
  ActivitySession,
  ActivityStateInterval,
  LiveActivitySession,
  OpenSessionCheckpoint,
  TrackingStatus,
} from '../shared/types.js';
import type { ActiveWindowInfo, ActivitySource } from './activity-source.js';
import { categoryForApplication } from './activity-source.js';
import type { ActivityRepository } from './database.js';
import { idleEndTime, transitionMidpoint } from './tracking/session-math.js';
import { isDefaultIgnoredApplication, isSelfApplication, normalizeApplication, type ResolvedApplication } from './tracking/app-identity.js';

interface TrackerOptions {
  now?: () => Date;
  idleSeconds?: () => number;
  machineId?: string;
  onStatus?: (status: TrackingStatus) => void;
}

interface OpenSession {
  id: string;
  info: ResolvedApplication;
  startedAt: Date;
  lastSampleAt: Date;
}

interface OpenActivityState {
  id: string;
  state: ActivityStateInterval['state'];
  startedAt: Date;
  source: ActivityStateInterval['source'];
  reason?: string;
}

export class ActivityTracker {
  private readonly now: () => Date;
  private readonly idleSeconds: () => number;
  private readonly machineId: string;
  private readonly onStatus?: (status: TrackingStatus) => void;
  private openSession?: OpenSession;
  private openActivityState?: OpenActivityState;
  private lifecycleState?: 'locked' | 'suspended';
  private timer?: ReturnType<typeof setInterval>;
  private timerIntervalMs?: number;
  private running = false;
  private generation = 0;
  private samplePromise?: Promise<void>;
  private status: TrackingStatus = { state: 'paused' };
  private latestSuccessfulSampleAt?: string;

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
    const now = this.now();
    this.closeSession(now);
    this.closeActivityState(now);
    this.setStatus({ state: 'paused' });
    this.source.dispose?.();
  }

  async pause() {
    this.repository.updateSettings({ trackingEnabled: false });
    this.generation += 1;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.timerIntervalMs = undefined;
    await this.samplePromise;
    const now = this.now();
    this.closeSession(now);
    this.closeActivityState(now);
    this.setStatus({ state: 'paused' });
  }

  async resume() {
    this.repository.updateSettings({ trackingEnabled: true });
    this.setStatus({ state: 'tracking' });
    await this.sample();
    if (this.running) this.scheduleTimer(this.repository.getSettings().sampleIntervalSeconds * 1_000);
  }

  handleLock(at = this.now()) {
    this.generation += 1;
    this.lifecycleState = 'locked';
    this.closeSession(at);
    this.beginActivityState('locked', at, 'power-monitor', 'The operating-system session is locked.');
    this.setStatus({ state: 'locked', since: at.toISOString() });
  }

  handleUnlock(at = this.now()) {
    if (this.lifecycleState === 'locked') this.lifecycleState = undefined;
    this.closeActivityState(at);
    this.setStatus({ state: 'unavailable', since: at.toISOString(), reason: 'Waiting for the next foreground sample after unlock.' });
  }

  handleSuspend(at = this.now()) {
    this.generation += 1;
    this.lifecycleState = 'suspended';
    this.closeSession(at);
    this.beginActivityState('suspended', at, 'power-monitor', 'The computer is suspended.');
    this.setStatus({ state: 'suspended', since: at.toISOString() });
  }

  handleResume(at = this.now()) {
    if (this.lifecycleState === 'suspended') this.lifecycleState = undefined;
    this.closeActivityState(at);
    this.setStatus({ state: 'unavailable', since: at.toISOString(), reason: 'Waiting for the next foreground sample after resume.' });
  }

  getStatus(): TrackingStatus {
    return { ...this.status };
  }

  getLatestSuccessfulSampleAt() {
    return this.latestSuccessfulSampleAt;
  }

  getLiveSession(at = this.now()): LiveActivitySession | undefined {
    if (!this.openSession) return undefined;
    const session = this.toSession(this.openSession, at);
    return { ...session, provisional: true };
  }

  discardOpenSession() {
    this.openSession = undefined;
    this.repository.clearOpenSessionCheckpoint(this.machineId);
  }

  async suspendForErase() {
    this.generation += 1;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.timerIntervalMs = undefined;
    await this.samplePromise;
    this.discardOpenSession();
    this.openActivityState = undefined;
    this.setStatus({ state: 'paused', reason: 'Archive reset in progress.' });
  }

  async resumeAfterErase() {
    await this.sample();
  }

  async sample(): Promise<void> {
    if (this.samplePromise) return this.samplePromise;
    const task = this.performSample(this.generation);
    this.samplePromise = task;
    try {
      await task;
    } finally {
      if (this.samplePromise === task) this.samplePromise = undefined;
    }
  }

  private async performSample(generation: number) {
    try {
      const settings = this.repository.getSettings();
      const now = this.now();
      if (this.running) this.scheduleTimer(settings.sampleIntervalSeconds * 1_000);
      if (this.lifecycleState) {
        this.setStatus({ state: this.lifecycleState, since: this.openActivityState?.startedAt.toISOString() });
        return;
      }
      if (!settings.trackingEnabled) {
        this.closeSession(now);
        this.closeActivityState(now);
        this.setStatus({ state: 'paused' });
        return;
      }
      const idleSeconds = this.idleSeconds();
      if (idleSeconds >= settings.idleThresholdSeconds) {
        const idleStartedAt = idleEndTime(now, idleSeconds, this.openSession?.startedAt ?? now);
        this.closeSession(idleStartedAt);
        this.beginActivityState('idle', idleStartedAt, 'os-idle', 'The operating system reports no recent input.');
        this.setStatus({ state: 'idle', since: this.openActivityState?.startedAt.toISOString() });
        return;
      }
      this.cutOffLongSamplingGap(now, settings.sampleIntervalSeconds);
      const detected = await this.source.getActiveWindow();
      if (generation !== this.generation) return;
      if (!detected) {
        const boundary = this.openSession ? transitionMidpoint(this.openSession.lastSampleAt, now) : now;
        this.closeSession(boundary);
        this.beginActivityState('unavailable', boundary, 'collector', 'No foreground application was detected.');
        this.setStatus({ state: 'unavailable', since: this.openActivityState?.startedAt.toISOString(), reason: 'No foreground application was detected.' });
        return;
      }
      const aliasKey = detected.path ?? detected.executable;
      const active = normalizeApplication(detected, this.repository.resolveApplicationAlias(aliasKey));
      this.latestSuccessfulSampleAt = now.toISOString();
      const includedByUser = settings.includedExecutables.includes(active.executable.toLowerCase());
      if (isSelfApplication(active) || ((isDefaultIgnoredApplication(active) || active.ignoredByDefault) && !includedByUser)) {
        const boundary = this.openSession ? transitionMidpoint(this.openSession.lastSampleAt, now) : now;
        this.closeSession(boundary);
        this.beginActivityState('untracked', boundary, 'privacy-rule', `${active.canonicalName} is ignored by a tracking rule.`);
        this.setStatus({ state: 'ignored', reason: `${active.canonicalName} is ignored by a tracking rule.` });
        return;
      }
      const excluded = settings.excludedExecutables.includes(active.executable.toLowerCase())
        || this.repository.isAppExcluded(active.executable);
      if (excluded) {
        const boundary = this.openSession ? transitionMidpoint(this.openSession.lastSampleAt, now) : now;
        this.closeSession(boundary);
        this.beginActivityState('untracked', boundary, 'privacy-rule', `${active.name} is excluded from tracking.`);
        this.setStatus({ state: 'ignored', reason: `${active.name} is excluded from tracking.` });
        return;
      }
      this.closeActivityState(now);
      if (this.openSession?.info.canonicalId === active.canonicalId) {
        this.openSession.lastSampleAt = now;
        if (settings.captureWindowTitles) this.openSession.info.title = active.title;
        this.checkpointOpenSession(now);
      } else {
        const startedAt = this.openSession ? transitionMidpoint(this.openSession.lastSampleAt, now) : now;
        this.closeSession(startedAt);
        this.openSession = { id: randomUUID(), info: active, startedAt, lastSampleAt: now };
        this.repository.upsertApplicationAlias({
          sourceExecutable: aliasKey,
          canonicalAppId: active.canonicalId,
          canonicalName: active.canonicalName,
          updatedAt: now.toISOString(),
        });
        this.checkpointOpenSession(now, true);
      }
      this.setStatus({ state: 'tracking', activeApp: active.name, since: this.openSession.startedAt.toISOString() });
    } catch (error) {
      if (generation !== this.generation) return;
      const now = this.now();
      const boundary = this.openSession ? transitionMidpoint(this.openSession.lastSampleAt, now) : now;
      try {
        this.closeSession(boundary);
        this.beginActivityState('unavailable', boundary, 'collector', error instanceof Error ? error.message : 'The activity source is unavailable.');
      } catch { /* Retry finalization on the next sample. */ }
      this.setStatus({
        state: 'unavailable',
        since: this.openActivityState?.startedAt.toISOString(),
        reason: error instanceof Error ? error.message : 'The activity source is unavailable.',
      });
    }
  }

  private closeSession(endedAt: Date) {
    if (!this.openSession) return;
    const session = this.toSession(this.openSession, endedAt);
    this.repository.finalizeOpenSession(session, {
      executable: this.openSession.info.executable,
      path: this.openSession.info.path,
    }, this.machineId);
    this.openSession = undefined;
  }

  private beginActivityState(
    state: ActivityStateInterval['state'],
    startedAt: Date,
    source: ActivityStateInterval['source'],
    reason?: string,
  ) {
    if (this.openActivityState?.state === state && this.openActivityState.source === source) return;
    this.closeActivityState(startedAt);
    this.openActivityState = { id: randomUUID(), state, startedAt, source, reason };
  }

  private closeActivityState(endedAt: Date) {
    if (!this.openActivityState) return;
    const startedAt = this.openActivityState.startedAt;
    const safeEnd = new Date(Math.max(startedAt.getTime(), endedAt.getTime()));
    if (safeEnd.getTime() > startedAt.getTime()) {
      this.repository.insertActivityStateInterval({
        id: this.openActivityState.id,
        state: this.openActivityState.state,
        startedAt: startedAt.toISOString(),
        endedAt: safeEnd.toISOString(),
        durationSeconds: Math.round((safeEnd.getTime() - startedAt.getTime()) / 1_000),
        machineId: this.machineId,
        source: this.openActivityState.source,
        reason: this.openActivityState.reason,
      });
    }
    this.openActivityState = undefined;
  }

  private cutOffLongSamplingGap(now: Date, intervalSeconds: number) {
    if (!this.openSession) return;
    const lastSampleAt = this.openSession.lastSampleAt;
    const gapMs = now.getTime() - lastSampleAt.getTime();
    const toleratedGapMs = Math.max(120_000, intervalSeconds * 4_000);
    if (gapMs <= toleratedGapMs) return;
    const boundary = new Date(lastSampleAt.getTime() + intervalSeconds * 1_000);
    this.closeSession(boundary);
    this.beginActivityState('unavailable', boundary, 'sampling-gap', 'PC Recap could not sample activity during this interval.');
  }

  private toSession(openSession: OpenSession, endedAt: Date): ActivitySession {
    const safeEnd = new Date(Math.max(openSession.startedAt.getTime(), endedAt.getTime()));
    return {
      id: openSession.id,
      appId: openSession.info.canonicalId,
      appName: openSession.info.canonicalName,
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
    try {
      const previous = this.repository.getOpenSessionCheckpoint(this.machineId);
      if (!force && previous && at.getTime() - new Date(previous.checkpointedAt).getTime() < 30_000) return;
      this.repository.saveOpenSessionCheckpoint({
        sessionId: this.openSession.id,
        machineId: this.machineId,
        appId: this.openSession.info.canonicalId,
        appName: this.openSession.info.canonicalName,
        executable: this.openSession.info.executable,
        path: this.openSession.info.path,
        categoryId: categoryForApplication(this.openSession.info),
        startedAt: this.openSession.startedAt.toISOString(),
        lastSampleAt: this.openSession.lastSampleAt.toISOString(),
        checkpointedAt: at.toISOString(),
        windowTitle: this.repository.getSettings().captureWindowTitles ? this.openSession.info.title : undefined,
      });
    } catch {
      // The live session remains in memory and the next sample retries the checkpoint.
    }
  }

  private recoverCheckpoint() {
    const checkpoint = this.repository.getOpenSessionCheckpoint(this.machineId);
    if (!checkpoint) return;
    const startedAt = new Date(checkpoint.startedAt);
    const endedAt = new Date(checkpoint.lastSampleAt);
    const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1_000));
    this.repository.finalizeOpenSession(this.sessionFromCheckpoint(checkpoint, durationSeconds), {
      executable: checkpoint.executable,
      path: checkpoint.path,
    }, this.machineId);
  }

  private sessionFromCheckpoint(checkpoint: OpenSessionCheckpoint, durationSeconds: number): ActivitySession {
    return {
      id: checkpoint.sessionId,
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
