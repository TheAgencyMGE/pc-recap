// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivitySession } from '../shared/types';
import { ActivityRepository } from './database';
import Database from 'better-sqlite3';

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

  it('includes committed WAL content in the pre-1.1 safety copy', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pc-recap-wal-backup-'));
    temporaryDirectories.push(root);
    const appData = join(root, 'app-data');
    const currentUserData = join(appData, 'PC Recap');
    mkdirSync(currentUserData, { recursive: true });
    const databasePath = join(currentUserData, 'pc-recap.db');
    const initial = new ActivityRepository(databasePath);
    initial.close();
    const writer = new Database(databasePath);
    writer.pragma('journal_mode = WAL');
    writer.pragma('wal_autocheckpoint = 0');
    writer.exec('CREATE TABLE wal_marker(value TEXT NOT NULL); INSERT INTO wal_marker(value) VALUES (\'committed-in-wal\');');
    expect(existsSync(`${databasePath}-wal`)).toBe(true);

    const { prepareActivityDatabase } = await import('./data-migration');
    await prepareActivityDatabase(currentUserData, appData);
    const safetyCopy = new Database(`${databasePath}.pre-1.1-backup`, { readonly: true });
    expect(safetyCopy.prepare('SELECT value FROM wal_marker').pluck().get()).toBe('committed-in-wal');
    safetyCopy.close();
    writer.close();
  });

  it('removes the migration safety copy and its sidecars during explicit erasure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pc-recap-erase-backup-'));
    temporaryDirectories.push(root);
    const databasePath = join(root, 'pc-recap.db');
    for (const suffix of ['.pre-1.1-backup', '.pre-1.1-backup-wal', '.pre-1.1-backup-shm', '.pre-1.1-backup-journal', '.pre-1.1-backup.tmp-123', '.tmp-456', '.tmp-456-wal']) writeFileSync(`${databasePath}${suffix}`, 'history');
    const { removeMigrationSafetyCopy } = await import('./data-migration');

    await removeMigrationSafetyCopy(databasePath);

    for (const suffix of ['.pre-1.1-backup', '.pre-1.1-backup-wal', '.pre-1.1-backup-shm', '.pre-1.1-backup-journal', '.pre-1.1-backup.tmp-123', '.tmp-456', '.tmp-456-wal']) expect(existsSync(`${databasePath}${suffix}`)).toBe(false);
  });

  it('removes migrated legacy databases and sidecars during explicit erasure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pc-recap-erase-legacy-'));
    temporaryDirectories.push(root);
    const appData = join(root, 'app-data');
    const currentUserData = join(appData, 'PC Recap');
    const legacyDatabase = join(appData, 'PC Wrapped', 'pc-wrapped.db');
    mkdirSync(dirname(legacyDatabase), { recursive: true });
    mkdirSync(currentUserData, { recursive: true });
    for (const suffix of ['', '-wal', '-shm', '-journal', '.tmp-123', '.tmp-123-shm']) writeFileSync(`${legacyDatabase}${suffix}`, 'history');
    const currentDatabase = join(currentUserData, 'pc-recap.db');
    writeFileSync(currentDatabase, 'current');
    const { removeLegacyActivityDatabases } = await import('./data-migration');

    await removeLegacyActivityDatabases(currentUserData, appData);

    for (const suffix of ['', '-wal', '-shm', '-journal', '.tmp-123', '.tmp-123-shm']) expect(existsSync(`${legacyDatabase}${suffix}`)).toBe(false);
    expect(existsSync(currentDatabase)).toBe(true);
  });
});

function sampleSession(): ActivitySession {
  return {
    id: 'pre-upgrade-history', appId: 'notepad', appName: 'Notepad', categoryId: 'work',
    startedAt: '2026-08-01T18:00:00.000Z', endedAt: '2026-08-01T18:30:00.000Z',
    durationSeconds: 1_800, machineId: 'desktop',
  };
}
