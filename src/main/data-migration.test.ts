// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivitySession } from '../shared/types';
import { ActivityRepository } from './database';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('prepareActivityDatabase', () => {
  it('preserves an existing beta archive when PC Recap starts for the first time', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pc-recap-brand-migration-'));
    temporaryDirectories.push(root);
    const appData = join(root, 'app-data');
    const currentUserData = join(appData, 'PC Recap');
    const legacyDatabase = join(appData, 'PC Wrapped', 'pc-wrapped.db');
    mkdirSync(dirname(legacyDatabase), { recursive: true });
    mkdirSync(currentUserData, { recursive: true });

    const legacy = new ActivityRepository(legacyDatabase);
    legacy.insertSession({
      id: 'history-survives-rename', appId: 'notepad', appName: 'Notepad', categoryId: 'work',
      startedAt: '2026-08-01T18:00:00.000Z', endedAt: '2026-08-01T18:30:00.000Z',
      durationSeconds: 1_800, machineId: 'desktop',
    });
    legacy.close();

    const { prepareActivityDatabase } = await import('./data-migration');
    const databasePath = await prepareActivityDatabase(currentUserData, appData);
    const migrated = new ActivityRepository(databasePath);

    expect(databasePath).toBe(join(currentUserData, 'pc-recap.db'));
    expect(migrated.getAllSessions()).toEqual([
      expect.objectContaining({ id: 'history-survives-rename', appName: 'Notepad' }),
    ]);
    migrated.close();
  });

  it('creates a one-time safety copy before upgrading an existing archive', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pc-recap-schema-backup-'));
    temporaryDirectories.push(root);
    const appData = join(root, 'app-data');
    const currentUserData = join(appData, 'PC Recap');
    mkdirSync(currentUserData, { recursive: true });
    const databasePath = join(currentUserData, 'pc-recap.db');
    const existing = new ActivityRepository(databasePath);
    existing.insertSession(sampleSession());
    existing.close();

    const { prepareActivityDatabase } = await import('./data-migration');
    await prepareActivityDatabase(currentUserData, appData);

    expect(existsSync(`${databasePath}.pre-1.1-backup`)).toBe(true);
    const backup = new ActivityRepository(`${databasePath}.pre-1.1-backup`);
    expect(backup.getAllSessions()).toEqual([expect.objectContaining({ id: 'pre-upgrade-history' })]);
    backup.close();
  });
});

function sampleSession(): ActivitySession {
  return {
    id: 'pre-upgrade-history', appId: 'notepad', appName: 'Notepad', categoryId: 'work',
    startedAt: '2026-08-01T18:00:00.000Z', endedAt: '2026-08-01T18:30:00.000Z',
    durationSeconds: 1_800, machineId: 'desktop',
  };
}
