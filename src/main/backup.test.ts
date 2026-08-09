// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
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
    const archive = new BackupService(source).exportBuffer(new Date('2025-01-01T00:00:00.000Z'));
    const target = makeRepository();

    const result = await new BackupService(target).importBuffer(archive);

    expect(result).toEqual({ importedSessions: 1, skippedSessions: 0 });
    expect(target.querySessions('2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'))
      .toEqual([expect.objectContaining({ id: 'portable-session', appName: 'Obsidian' })]);
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

    await expect(new BackupService(target).importBuffer(archive)).resolves.toEqual({ importedSessions: 0, skippedSessions: 1 });
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

    await expect(new BackupService(target).importBuffer(archive)).rejects.toThrow(/valid PC Wrapped backup/i);
    expect(target.getAllSessions()).toEqual([]);
  });
});
