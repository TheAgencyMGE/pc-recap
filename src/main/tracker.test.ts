// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { ActivityRepository } from './database';
import type { ActiveWindowInfo, ActivitySource } from './activity-source';
import { ActivityTracker } from './tracker';

class SequenceSource implements ActivitySource {
  constructor(private readonly sequence: Array<ActiveWindowInfo | null>) {}
  async getActiveWindow() {
    return this.sequence.shift() ?? null;
  }
}

const stores: ActivityRepository[] = [];
const store = () => {
  const result = new ActivityRepository(':memory:');
  stores.push(result);
  return result;
};

afterEach(() => {
  for (const instance of stores.splice(0)) instance.close();
});

describe('ActivityTracker', () => {
  it('merges adjacent samples and closes a session when the application changes', async () => {
    const repository = store();
    const source = new SequenceSource([
      { name: 'Visual Studio Code', executable: 'Code.exe', path: 'C:\\Code.exe', title: 'index.ts' },
      { name: 'Visual Studio Code', executable: 'Code.exe', path: 'C:\\Code.exe', title: 'App.tsx' },
      { name: 'Discord', executable: 'Discord.exe', path: 'C:\\Discord.exe', title: 'Friends' },
      null,
    ]);
    const times = [
      '2025-05-01T10:00:00.000Z', '2025-05-01T10:00:10.000Z',
      '2025-05-01T10:00:20.000Z', '2025-05-01T10:00:30.000Z',
    ].map((time) => new Date(time));
    const tracker = new ActivityTracker(repository, source, {
      now: () => times.shift()!, idleSeconds: () => 0, machineId: 'test-pc',
    });

    await tracker.sample();
    await tracker.sample();
    await tracker.sample();
    await tracker.sample();

    expect(repository.getAllSessions()).toEqual([
      expect.objectContaining({ appName: 'Visual Studio Code', durationSeconds: 15, machineId: 'test-pc' }),
      expect.objectContaining({ appName: 'Discord', durationSeconds: 10, machineId: 'test-pc' }),
    ]);
  });

  it('treats a multi-monitor desktop as one global foreground stream without duplicate time', async () => {
    const repository = store();
    const source = new SequenceSource([
      { name: 'Chrome', executable: 'chrome.exe', path: 'C:\\chrome.exe' },
      { name: 'Chrome', executable: 'chrome.exe', path: 'C:\\chrome.exe' },
      { name: 'Discord', executable: 'Discord.exe', path: 'C:\\Discord.exe' },
      null,
    ]);
    const times = [
      '2026-08-15T10:00:00.000Z', '2026-08-15T10:00:10.000Z',
      '2026-08-15T10:00:20.000Z', '2026-08-15T10:00:30.000Z',
    ].map((time) => new Date(time));
    const tracker = new ActivityTracker(repository, source, {
      now: () => times.shift()!, idleSeconds: () => 0, machineId: 'two-display-pc',
    });

    await tracker.sample();
    await tracker.sample();
    await tracker.sample();
    await tracker.sample();

    const sessions = repository.getAllSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.reduce((total, session) => total + session.durationSeconds, 0)).toBe(25);
    expect(sessions[0].endedAt <= sessions[1].startedAt).toBe(true);
  });

  it('suppresses idle and privacy-excluded applications', async () => {
    const repository = store();
    repository.updateSettings({ excludedExecutables: ['secret.exe'], idleThresholdSeconds: 60 });
    const source = new SequenceSource([
      { name: 'Secret', executable: 'Secret.exe', path: 'C:\\Secret.exe' },
      { name: 'Chrome', executable: 'chrome.exe', path: 'C:\\chrome.exe' },
    ]);
    const idleValues = [0, 90];
    const tracker = new ActivityTracker(repository, source, {
      now: () => new Date('2025-05-01T10:00:00.000Z'),
      idleSeconds: () => idleValues.shift()!,
    });

    await tracker.sample();
    await tracker.sample();

    expect(repository.getAllSessions()).toEqual([]);
    expect(tracker.getStatus().state).toBe('idle');
  });

  it('honors pause without querying the activity source', async () => {
    const repository = store();
    repository.updateSettings({ trackingEnabled: false });
    let calls = 0;
    const source: ActivitySource = { getActiveWindow: async () => { calls += 1; return null; } };
    const tracker = new ActivityTracker(repository, source, {
      now: () => new Date('2025-05-01T10:00:00.000Z'), idleSeconds: () => 0,
    });

    await tracker.sample();

    expect(calls).toBe(0);
    expect(tracker.getStatus()).toMatchObject({ state: 'paused' });
  });

  it('honors an application exclusion saved from the app detail page', async () => {
    const repository = store();
    repository.insertSession({
      id: 'existing-secret-session',
      appId: 'secret-exe',
      appName: 'Secret',
      categoryId: 'other',
      startedAt: '2024-01-01T10:00:00.000Z',
      endedAt: '2024-01-01T10:00:10.000Z',
      durationSeconds: 10,
    }, { executable: 'Secret.exe' });
    repository.setAppExcluded('secret-exe', true);
    const source = new SequenceSource([
      { name: 'Secret', executable: 'Secret.exe', path: 'C:\\Secret.exe' },
      null,
    ]);
    const times = ['2025-05-01T10:00:00.000Z', '2025-05-01T10:00:10.000Z'].map((time) => new Date(time));
    const tracker = new ActivityTracker(repository, source, {
      now: () => times.shift()!, idleSeconds: () => 0,
    });

    await tracker.sample();
    await tracker.sample();

    expect(repository.getAllSessions()).toHaveLength(1);
    expect(tracker.getStatus()).toMatchObject({ state: 'unavailable' });
  });

  it('exposes provisional activity without writing it into finalized history', async () => {
    const repository = store();
    const source = new SequenceSource([
      { name: 'Visual Studio Code', executable: 'Code.exe', path: 'C:\\Code.exe' },
    ]);
    const times = [
      new Date('2026-08-15T10:00:00.000Z'),
      new Date('2026-08-15T10:02:00.000Z'),
    ];
    const tracker = new ActivityTracker(repository, source, {
      now: () => times.shift()!, idleSeconds: () => 0, machineId: 'test-pc',
    });

    await tracker.sample();

    const firstSnapshot = tracker.getLiveSession();
    const secondSnapshot = tracker.getLiveSession(new Date('2026-08-15T10:02:10.000Z'));
    expect(firstSnapshot).toMatchObject({
      appName: 'Visual Studio Code', durationSeconds: 120, provisional: true,
    });
    expect(secondSnapshot?.id).toBe(firstSnapshot?.id);
    expect(repository.getAllSessions()).toEqual([]);
    expect(repository.getOpenSessionCheckpoint('test-pc')).toMatchObject({ appId: 'visual-studio-code' });
  });

  it('recovers a crashed session only through its final observed sample', () => {
    const repository = store();
    repository.saveOpenSessionCheckpoint({
      sessionId: 'recovered-session', machineId: 'test-pc', appId: 'code-exe', appName: 'Visual Studio Code', executable: 'Code.exe',
      categoryId: 'coding', startedAt: '2026-08-15T10:00:00.000Z',
      lastSampleAt: '2026-08-15T10:00:30.000Z', checkpointedAt: '2026-08-15T10:00:31.000Z',
    });

    new ActivityTracker(repository, new SequenceSource([]), {
      now: () => new Date('2026-08-15T11:00:00.000Z'), idleSeconds: () => 0, machineId: 'test-pc',
    });

    expect(repository.getAllSessions()).toEqual([
      expect.objectContaining({ durationSeconds: 30, startedAt: '2026-08-15T10:00:00.000Z' }),
    ]);
    expect(repository.getOpenSessionCheckpoint('test-pc')).toBeUndefined();
  });

  it('does not double-count when finalization committed before a crash left the checkpoint behind', () => {
    const repository = store();
    repository.saveOpenSessionCheckpoint({
      sessionId: 'stable-open-session', machineId: 'test-pc', appId: 'code-exe', appName: 'Visual Studio Code', executable: 'Code.exe',
      categoryId: 'coding', startedAt: '2026-08-15T10:00:00.000Z',
      lastSampleAt: '2026-08-15T10:00:30.000Z', checkpointedAt: '2026-08-15T10:00:31.000Z',
    });
    repository.insertSession({
      id: 'stable-open-session', appId: 'code-exe', appName: 'Visual Studio Code', categoryId: 'coding',
      startedAt: '2026-08-15T10:00:00.000Z', endedAt: '2026-08-15T10:00:30.000Z', durationSeconds: 30,
      machineId: 'test-pc', sourceKind: 'pc_recap', confidence: 'recorded',
    }, { executable: 'Code.exe' });

    new ActivityTracker(repository, new SequenceSource([]), {
      now: () => new Date('2026-08-15T11:00:00.000Z'), idleSeconds: () => 0, machineId: 'test-pc',
    });

    expect(repository.getAllSessions()).toHaveLength(1);
    expect(repository.getOpenSessionCheckpoint('test-pc')).toBeUndefined();
  });

  it('subtracts the full idle interval from an open session', async () => {
    const repository = store();
    repository.updateSettings({ idleThresholdSeconds: 60 });
    const source = new SequenceSource([
      { name: 'Chrome', executable: 'chrome.exe', path: 'C:\\chrome.exe' },
      { name: 'Chrome', executable: 'chrome.exe', path: 'C:\\chrome.exe' },
    ]);
    const times = [
      new Date('2026-08-15T09:59:00.000Z'),
      new Date('2026-08-15T10:05:10.000Z'),
      new Date('2026-08-15T10:06:00.000Z'),
    ];
    const idleValues = [0, 310, 0];
    const tracker = new ActivityTracker(repository, source, {
      now: () => times.shift()!, idleSeconds: () => idleValues.shift()!, machineId: 'test-pc',
    });

    await tracker.sample();
    await tracker.sample();
    await tracker.sample();

    expect(repository.getAllSessions()).toEqual([
      expect.objectContaining({ durationSeconds: 60, endedAt: '2026-08-15T10:00:00.000Z' }),
    ]);
    expect(repository.getAllActivityStateIntervals()).toEqual([
      expect.objectContaining({
        state: 'idle',
        startedAt: '2026-08-15T10:00:00.000Z',
        endedAt: '2026-08-15T10:06:00.000Z',
        durationSeconds: 360,
      }),
    ]);
  });

  it('records lock and suspend as lifecycle states without inflating application time', async () => {
    const repository = store();
    const tracker = new ActivityTracker(repository, new SequenceSource([
      { name: 'Chrome', executable: 'chrome.exe', path: 'C:\\chrome.exe' },
    ]), {
      now: () => new Date('2026-08-15T10:00:00.000Z'),
      idleSeconds: () => 0,
      machineId: 'test-pc',
    }) as ActivityTracker & {
      handleLock(at: Date): void;
      handleUnlock(at: Date): void;
      handleSuspend(at: Date): void;
      handleResume(at: Date): void;
    };

    await tracker.sample();
    tracker.handleLock(new Date('2026-08-15T10:01:00.000Z'));
    tracker.handleUnlock(new Date('2026-08-15T10:05:00.000Z'));
    tracker.handleSuspend(new Date('2026-08-15T10:06:00.000Z'));
    tracker.handleResume(new Date('2026-08-15T18:06:00.000Z'));

    expect(repository.getAllSessions()).toEqual([
      expect.objectContaining({ appName: 'Chrome', durationSeconds: 60 }),
    ]);
    expect(repository.getAllActivityStateIntervals()).toEqual([
      expect.objectContaining({ state: 'locked', durationSeconds: 240 }),
      expect.objectContaining({ state: 'suspended', durationSeconds: 28_800 }),
    ]);
    expect(tracker.getStatus()).toMatchObject({ state: 'unavailable' });
  });

  it('cuts off an application at the last trustworthy sample after a long collector gap', async () => {
    const repository = store();
    repository.updateSettings({ sampleIntervalSeconds: 10 });
    const times = [
      new Date('2026-08-15T10:00:00.000Z'),
      new Date('2026-08-15T18:00:00.000Z'),
    ];
    const tracker = new ActivityTracker(repository, new SequenceSource([
      { name: 'Chrome', executable: 'chrome.exe', path: 'C:\\chrome.exe' },
      { name: 'Chrome', executable: 'chrome.exe', path: 'C:\\chrome.exe' },
    ]), { now: () => times.shift()!, idleSeconds: () => 0, machineId: 'test-pc' });

    await tracker.sample();
    await tracker.sample();

    expect(repository.getAllSessions()).toEqual([
      expect.objectContaining({ appName: 'Chrome', durationSeconds: 10 }),
    ]);
    expect(repository.getAllActivityStateIntervals()).toEqual([
      expect.objectContaining({ state: 'unavailable', durationSeconds: 28_790, source: 'sampling-gap' }),
    ]);
    expect(tracker.getLiveSession(new Date('2026-08-15T18:00:10.000Z'))).toMatchObject({
      appName: 'Chrome', durationSeconds: 10,
    });
  });

  it('does not record PC Recap or Windows shell-only foreground processes', async () => {
    const repository = store();
    const source = new SequenceSource([
      { name: 'PC Recap', executable: 'PC Recap.exe', path: 'C:\\PC Recap.exe' },
      { name: 'SearchHost', executable: 'SearchHost.exe', path: 'C:\\Windows\\SearchHost.exe' },
    ]);
    const times = [new Date('2026-08-15T10:00:00.000Z'), new Date('2026-08-15T10:00:10.000Z')];
    const tracker = new ActivityTracker(repository, source, {
      now: () => times.shift()!, idleSeconds: () => 0, machineId: 'test-pc',
    });

    await tracker.sample();
    await tracker.sample();

    expect(repository.getAllSessions()).toEqual([]);
    expect(tracker.getLiveSession()).toBeUndefined();
  });

  it('reports ignored rules distinctly and lets the user include a shell executable', async () => {
    const repository = store();
    repository.updateSettings({ includedExecutables: ['searchhost.exe'] });
    const source = new SequenceSource([
      { name: 'SearchHost', executable: 'SearchHost.exe', path: 'C:\\Windows\\SearchHost.exe' },
      { name: 'CredentialUIBroker', executable: 'CredentialUIBroker.exe', path: 'C:\\Windows\\CredentialUIBroker.exe' },
    ]);
    const times = [new Date('2026-08-15T10:00:00.000Z'), new Date('2026-08-15T10:00:10.000Z')];
    const tracker = new ActivityTracker(repository, source, { now: () => times.shift()!, idleSeconds: () => 0 });

    await tracker.sample();
    expect(tracker.getLiveSession(new Date('2026-08-15T10:00:01.000Z'))?.appName).toBe('SearchHost');
    await tracker.sample();
    expect(tracker.getStatus()).toMatchObject({ state: 'ignored', reason: expect.stringContaining('ignored') });
    expect(repository.getAllSessions()).toEqual([expect.objectContaining({ appName: 'SearchHost', durationSeconds: 5 })]);
  });

  it('keeps collecting when a checkpoint write fails temporarily', async () => {
    const repository = store();
    repository.saveOpenSessionCheckpoint = () => { throw new Error('disk busy'); };
    const tracker = new ActivityTracker(repository, new SequenceSource([
      { name: 'Chrome', executable: 'chrome.exe', path: 'C:\\Chrome.exe' },
    ]), { now: () => new Date('2026-08-15T10:00:00.000Z'), idleSeconds: () => 0 });

    await tracker.sample();

    expect(tracker.getStatus()).toMatchObject({ state: 'tracking', activeApp: 'Chrome' });
    expect(tracker.getLiveSession(new Date('2026-08-15T10:00:10.000Z'))).toMatchObject({ appName: 'Chrome' });
  });

  it('quiesces an in-flight sample before erasure and resumes from a fresh timestamp', async () => {
    const repository = store();
    let releaseOldSample!: (value: ActiveWindowInfo) => void;
    const oldSample = new Promise<ActiveWindowInfo>((resolve) => { releaseOldSample = resolve; });
    let calls = 0;
    const source: ActivitySource = {
      getActiveWindow: async () => {
        calls += 1;
        return calls === 1 ? oldSample : { name: 'Edge', executable: 'msedge.exe', path: 'C:\\Edge.exe' };
      },
    };
    const times = [new Date('2026-08-15T10:00:00.000Z'), new Date('2026-08-15T11:00:00.000Z')];
    const tracker = new ActivityTracker(repository, source, { now: () => times.shift()!, idleSeconds: () => 0, machineId: 'test-pc' });
    const pendingSample = tracker.sample();
    const suspended = tracker.suspendForErase();
    releaseOldSample({ name: 'Chrome', executable: 'chrome.exe', path: 'C:\\Chrome.exe' });
    await Promise.all([pendingSample, suspended]);

    expect(tracker.getLiveSession(new Date('2026-08-15T10:30:00.000Z'))).toBeUndefined();
    expect(repository.getOpenSessionCheckpoint('test-pc')).toBeUndefined();
    repository.deleteAllHistory();
    await tracker.resumeAfterErase();

    expect(tracker.getLiveSession(new Date('2026-08-15T11:00:10.000Z'))).toMatchObject({ appName: 'Microsoft Edge', startedAt: '2026-08-15T11:00:00.000Z' });
  });
});
