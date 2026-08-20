// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { gunzipSync, gzipSync } from 'node:zlib';
import { BackupService } from './backup';
import { ActivityRepository } from './database';

const repositories: ActivityRepository[] = [];
const makeRepository = () => {
  const result = new ActivityRepository(':memory:');
  repositories.push(result);
  return result;
};

afterEach(() => {
  for (const instance of repositories.splice(0)) instance.close();
});

describe('BackupService', () => {
  it('round-trips a compressed versioned archive and reports imported sessions', async () => {
    const source = makeRepository();
    source.insertSession({
      id: 'portable-session', appId: 'obsidian', appName: 'Obsidian', categoryId: 'work',
      startedAt: '2024-06-02T12:00:00.000Z', endedAt: '2024-06-02T12:45:00.000Z',
      durationSeconds: 2_700, machineId: 'laptop',
    });
    source.commitHistoryBatch({
      batch: { id: 'portable-batch', sourceKind: 'windows_recovery', sourceFingerprint: 'portable-clue', importedAt: '2024-06-03T00:00:00.000Z', exactSessionCount: 0, recoveredEventCount: 1 },
      sessions: [],
      recoveredEvents: [{
        id: 'portable-event', appName: 'Blender', eventType: 'installed', occurredAt: '2024-05-01T12:00:00.000Z',
        sourceKind: 'windows_installed_apps', confidence: 'medium', importBatchId: 'portable-batch',
      }],
    });
    source.saveMemoryPin({
      id: 'portable-pin', title: 'Built PC Recap', note: 'First beta', start: '2024-06-02T00:00:00.000Z', end: '2024-06-03T00:00:00.000Z',
      color: '#4256f4', includeInRecaps: false, createdAt: '2024-06-02T00:00:00.000Z', updatedAt: '2024-06-02T00:00:00.000Z',
    });
    source.insertActivityStateInterval({
      id: 'portable-idle', state: 'idle', startedAt: '2024-06-02T12:45:00.000Z', endedAt: '2024-06-02T13:00:00.000Z',
      durationSeconds: 900, machineId: 'laptop', source: 'os-idle',
    });
    source.insertPerformanceSample({
      id: 'portable-load', sampledAt: '2024-06-02T12:30:00.000Z', machineId: 'laptop', intervalSeconds: 10,
      cpuPercent: 81, memoryPercent: 63, foregroundAppId: 'obsidian', foregroundAppName: 'Obsidian',
    });
    const archive = new BackupService(source).exportBuffer(new Date('2025-01-01T00:00:00.000Z'));
    const exported = JSON.parse(gunzipSync(archive).toString('utf8')) as { manifest: { product: string; version: number } };
    const target = makeRepository();

    const result = await new BackupService(target).importBuffer(archive);

    expect(exported.manifest.product).toBe('PC Recap');
    expect(exported.manifest.version).toBe(3);
    expect(result).toEqual({ importedSessions: 1, skippedSessions: 0, importedRecoveredEvents: 1, importedMemoryPins: 1 });
    expect(target.querySessions('2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'))
      .toEqual([expect.objectContaining({ id: 'portable-session', appName: 'Obsidian' })]);
    expect(target.listRecoveredEvents()).toEqual([expect.objectContaining({ id: 'portable-event', appName: 'Blender' })]);
    expect(target.listMemoryPins()).toEqual([expect.objectContaining({ id: 'portable-pin', title: 'Built PC Recap' })]);
    expect(target.getAllActivityStateIntervals()).toEqual([expect.objectContaining({ id: 'portable-idle', state: 'idle' })]);
    expect(target.getAllPerformanceSamples()).toEqual([expect.objectContaining({ id: 'portable-load', cpuPercent: 81 })]);
    expect(target.getAllPerformanceRollups()).toHaveLength(2);
    expect(target.getAllAppPerformanceRollups()).toEqual([expect.objectContaining({ appId: 'obsidian', cpuAverage: 81 })]);
  });

  it('keeps importing version 2 archives that have no state or performance history', async () => {
    const target = makeRepository();
    const archive = gzipSync(Buffer.from(JSON.stringify({
      manifest: { version: 2, product: 'PC Recap', exportedAt: '2026-01-01T00:00:00.000Z' },
      data: { apps: [], sessions: [], categories: [], settings: {} },
    }), 'utf8'));

    await expect(new BackupService(target).importBuffer(archive)).resolves.toEqual({
      importedSessions: 0, skippedSessions: 0, importedRecoveredEvents: 0, importedMemoryPins: 0,
    });
  });

  it('keeps one canonical app identity when a 1.2 archive contains Windows, macOS, and Linux sessions', async () => {
    const source = makeRepository();
    const platforms = [
      { id: 'windows', executable: 'chrome.exe', path: 'C:\\Program Files\\Google\\Chrome\\chrome.exe' },
      { id: 'macos', executable: 'Google Chrome', path: '/Applications/Google Chrome.app' },
      { id: 'linux', executable: 'google-chrome-stable', path: '/usr/bin/google-chrome-stable' },
    ];
    platforms.forEach((platform, index) => source.insertSession({
      id: `chrome-${platform.id}`, appId: 'chrome', appName: 'Chrome', categoryId: 'browsing',
      startedAt: `2026-08-0${index + 1}T10:00:00.000Z`, endedAt: `2026-08-0${index + 1}T10:10:00.000Z`,
      durationSeconds: 600, machineId: platform.id,
    }, { executable: platform.executable, path: platform.path }));
    const archive = new BackupService(source).exportBuffer(new Date('2026-08-20T00:00:00.000Z'));
    const target = makeRepository();

    await new BackupService(target).importBuffer(archive);

    expect(target.getAllSessions()).toHaveLength(3);
    expect(new Set(target.getAllSessions().map((session) => session.appId))).toEqual(new Set(['chrome']));
    expect(target.listApps()).toEqual([expect.objectContaining({ id: 'chrome', name: 'Chrome' })]);
  });

  it('rejects an archive with a schema version newer than the app understands', async () => {
    const store = makeRepository();
    const invalid = Buffer.from(JSON.stringify({ manifest: { version: 999 }, data: {} }), 'utf8');

    await expect(new BackupService(store).importBuffer(invalid)).rejects.toThrow('Unsupported backup version');
  });

  it('refuses synthetic sessions embedded in an old backup', async () => {
    const target = makeRepository();
    const archive = gzipSync(Buffer.from(JSON.stringify({
      manifest: { version: 1, product: 'PC Wrapped', exportedAt: '2026-01-01T00:00:00.000Z' },
      data: {
        apps: [], categories: [], settings: {},
        sessions: [{
          id: 'legacy-generated', appId: 'generated-app', appName: 'Generated App', categoryId: 'other',
          startedAt: '2025-01-01T10:00:00.000Z', endedAt: '2025-01-01T11:00:00.000Z',
          durationSeconds: 3_600, machineId: 'legacy', isDemo: true,
        }],
      },
    }), 'utf8'));

    await expect(new BackupService(target).importBuffer(archive)).resolves.toEqual({ importedSessions: 0, skippedSessions: 1, importedRecoveredEvents: 0, importedMemoryPins: 0 });
    expect(target.getAllSessions()).toEqual([]);
  });

  it('rejects a compressed archive before it can expand past the decoded-size limit', async () => {
    const target = makeRepository();
    const archive = gzipSync(Buffer.from('x'.repeat(4_096), 'utf8'));

    await expect(new BackupService(target, {
      maxCompressedBytes: 1_024,
      maxDecodedBytes: 128,
    }).importBuffer(archive)).rejects.toThrow(/too large/i);
  });

  it('rejects malformed archive records before they reach SQLite', async () => {
    const target = makeRepository();
    const archive = gzipSync(Buffer.from(JSON.stringify({
      manifest: { version: 1, product: 'PC Wrapped', exportedAt: '2026-01-01T00:00:00.000Z' },
      data: { apps: [], categories: [], settings: {}, sessions: [{ id: 'missing-fields' }] },
    }), 'utf8'));

    await expect(new BackupService(target).importBuffer(archive)).rejects.toThrow(/valid PC Recap backup/i);
    expect(target.getAllSessions()).toEqual([]);
  });
});
