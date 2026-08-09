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
      expect.objectContaining({ appName: 'Visual Studio Code', durationSeconds: 20, machineId: 'test-pc' }),
      expect.objectContaining({ appName: 'Discord', durationSeconds: 10, machineId: 'test-pc' }),
    ]);
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
});
