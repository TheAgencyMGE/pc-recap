// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActivityRepository } from './database';
import type { ActivitySession, OpenSessionCheckpoint } from '../shared/types';

const openRepositories: ActivityRepository[] = [];
const temporaryDirectories: string[] = [];
const repository = () => {
  const instance = new ActivityRepository(':memory:');
  openRepositories.push(instance);
  return instance;
};

afterEach(() => {
  for (const instance of openRepositories.splice(0)) instance.close();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const sample: ActivitySession = {
  id: 'session-1',
  appId: 'vscode',
  appName: 'VS Code',
  categoryId: 'coding',
  startedAt: '2025-03-14T09:00:00.000Z',
  endedAt: '2025-03-14T10:30:00.000Z',
  durationSeconds: 5_400,
  machineId: 'machine-a',
};

describe('ActivityRepository', () => {
  it('deduplicates sessions without double-counting daily rollups', () => {
    const store = repository();

    expect(store.insertSession(sample)).toBe(true);
    expect(store.insertSession(sample)).toBe(false);

    expect(store.querySessions('2025-03-01T00:00:00.000Z', '2025-04-01T00:00:00.000Z')).toHaveLength(1);
    expect(store.getDailyRollups('2025-03-01', '2025-03-31')).toEqual([
      expect.objectContaining({ day: '2025-03-14', durationSeconds: 5_400, sessionCount: 1 }),
    ]);
  });

  it('persists validated settings and merges defaults', () => {
    const store = repository();

    store.updateSettings({ captureWindowTitles: true, idleThresholdSeconds: 600 });

    expect(store.getSettings()).toMatchObject({
      trackingEnabled: true,
      captureWindowTitles: true,
      idleThresholdSeconds: 600,
      sampleIntervalSeconds: 10,
    });
  });

  it('round-trips an open session checkpoint without finalizing activity', () => {
    const store = repository();
    const checkpoint: OpenSessionCheckpoint = {
      machineId: 'pc',
      appId: 'code',
      appName: 'Visual Studio Code',
      executable: 'Code.exe',
      categoryId: 'coding',
      startedAt: '2026-08-15T10:00:00.000Z',
      lastSampleAt: '2026-08-15T10:00:30.000Z',
      checkpointedAt: '2026-08-15T10:00:30.000Z',
    };

    store.saveOpenSessionCheckpoint(checkpoint);

    expect(store.getOpenSessionCheckpoint('pc')).toEqual(checkpoint);
    expect(store.getAllSessions()).toHaveLength(0);
    store.clearOpenSessionCheckpoint('pc');
    expect(store.getOpenSessionCheckpoint('pc')).toBeUndefined();
  });

  it('resolves canonical aliases by normalized executable path', () => {
    const store = repository();

    store.upsertApplicationAlias({
      sourceExecutable: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
      canonicalAppId: 'visual-studio-code',
      canonicalName: 'Visual Studio Code',
      updatedAt: '2026-08-15T10:00:00.000Z',
    });

    expect(store.resolveApplicationAlias('c:\\program files\\microsoft vs code\\CODE.EXE')).toMatchObject({
      canonicalAppId: 'visual-studio-code',
      canonicalName: 'Visual Studio Code',
    });
  });

  it('stores session provenance without changing duration totals', () => {
    const store = repository();
    store.insertSession({ ...sample, sourceKind: 'activitywatch', confidence: 'imported_exact' });

    expect(store.getAllSessions()).toEqual([
      expect.objectContaining({
        durationSeconds: 5_400,
        sourceKind: 'activitywatch',
        confidence: 'imported_exact',
      }),
    ]);
  });

  it('persists the first chronological achievement unlock', () => {
    const store = repository();

    store.saveAchievementUnlock('week-in-life', '2026-08-07T09:00:00.000Z');
    store.saveAchievementUnlock('week-in-life', '2026-08-08T09:00:00.000Z');

    expect(store.getAchievementUnlock('week-in-life')).toBe('2026-08-07T09:00:00.000Z');
  });

  it('deletes a custom category only after reassigning its applications', () => {
    const store = repository();
    store.upsertCategory({ id: 'research', name: 'Research', color: '#123456', icon: 'book', isDefault: false });
    store.insertSession({ ...sample, appId: 'paper', appName: 'Paper', categoryId: 'research' });

    store.deleteCategory('research', 'work');

    expect(store.getCategories().some((category) => category.id === 'research')).toBe(false);
    expect(store.listApps().find((app) => app.id === 'paper')?.categoryId).toBe('work');
    expect(() => store.deleteCategory('work', 'other')).toThrow(/default/i);
  });

  it('returns joined application metadata in chronological range queries', () => {
    const store = repository();
    store.insertSession(sample);
    store.insertSession({
      ...sample,
      id: 'session-2',
      appId: 'discord',
      appName: 'Discord',
      categoryId: 'social',
      startedAt: '2025-03-14T11:00:00.000Z',
      endedAt: '2025-03-14T11:05:00.000Z',
      durationSeconds: 300,
    });

    expect(store.querySessions('2025-03-14T10:00:00.000Z', '2025-03-15T00:00:00.000Z'))
      .toEqual([
        expect.objectContaining({ id: 'session-1', startedAt: '2025-03-14T10:00:00.000Z', durationSeconds: 1_800 }),
        expect.objectContaining({ id: 'session-2', appName: 'Discord', categoryId: 'social' }),
      ]);
  });

  it('clips an overnight session into the requested local-day range', () => {
    const store = repository();
    const start = new Date(2025, 0, 15, 23, 50);
    const end = new Date(2025, 0, 16, 0, 10);
    store.insertSession({
      ...sample,
      id: 'overnight',
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      durationSeconds: 1_200,
    });

    expect(store.querySessions(
      new Date(2025, 0, 16).toISOString(),
      new Date(2025, 0, 17).toISOString(),
    )).toEqual([
      expect.objectContaining({
        id: 'overnight',
        startedAt: new Date(2025, 0, 16).toISOString(),
        endedAt: end.toISOString(),
        durationSeconds: 600,
      }),
    ]);
    expect(store.getDailyRollups('2025-01-15', '2025-01-16')).toEqual([
      expect.objectContaining({ day: '2025-01-15', durationSeconds: 600, sessionCount: 1 }),
      expect.objectContaining({ day: '2025-01-16', durationSeconds: 600, sessionCount: 1 }),
    ]);
  });

  it('erases all history across raw and rollup tables', () => {
    const store = repository();
    store.insertSession(sample);
    store.commitHistoryBatch({
      batch: { id: 'batch-delete', sourceKind: 'windows_recovery', sourceFingerprint: 'delete-me', importedAt: '2025-03-15T00:00:00.000Z', exactSessionCount: 0, recoveredEventCount: 1 },
      sessions: [],
      recoveredEvents: [{ id: 'event-delete', appName: 'Blender', eventType: 'installed', occurredAt: '2025-03-01T00:00:00.000Z', sourceKind: 'windows_installed_apps', confidence: 'medium', importBatchId: 'batch-delete' }],
    });

    store.deleteAllHistory();

    expect(store.getAllSessions()).toEqual([]);
    expect(store.listRecoveredEvents()).toEqual([]);
    expect(store.getDailyRollups('2025-03-01', '2025-03-31')).toEqual([]);
  });

  it('purges synthetic history left by pre-production builds during migration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pc-recap-migration-'));
    temporaryDirectories.push(directory);
    const location = join(directory, 'archive.db');
    const initial = new ActivityRepository(location);
    initial.insertSession(sample);
    initial.close();

    const legacy = new Database(location);
    const appColumns = legacy.prepare('PRAGMA table_info(applications)').all() as Array<{ name: string }>;
    const sessionColumns = legacy.prepare('PRAGMA table_info(activity_sessions)').all() as Array<{ name: string }>;
    if (!appColumns.some((column) => column.name === 'is_demo')) legacy.exec('ALTER TABLE applications ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0');
    if (!sessionColumns.some((column) => column.name === 'is_demo')) legacy.exec('ALTER TABLE activity_sessions ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0');
    legacy.exec('UPDATE applications SET is_demo = 1; UPDATE activity_sessions SET is_demo = 1;');
    legacy.close();

    const migrated = new ActivityRepository(location);
    const migratedSessions = migrated.getAllSessions();
    migrated.close();
    expect(migratedSessions).toEqual([]);
    const verified = new Database(location);
    expect((verified.prepare('PRAGMA table_info(applications)').all() as Array<{ name: string }>).some((column) => column.name === 'is_demo')).toBe(false);
    expect((verified.prepare('PRAGMA table_info(activity_sessions)').all() as Array<{ name: string }>).some((column) => column.name === 'is_demo')).toBe(false);
    verified.close();
  });
});
