// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { ActivityRepository } from '../database';
import { HistoryImportService } from './import-service';
import type { ImportPreview } from './types';

const repositories: ActivityRepository[] = [];
const createRepository = () => {
  const repository = new ActivityRepository(':memory:');
  repositories.push(repository);
  return repository;
};

afterEach(() => repositories.splice(0).forEach((repository) => repository.close()));

const preview = (): ImportPreview => ({
  sourceKind: 'activitywatch',
  sourceFingerprint: 'sha256:test-source',
  sourceLabel: 'ActivityWatch export',
  exactSessions: [
    {
      sourceKind: 'activitywatch', sourceRecordId: 'one', appName: 'Visual Studio Code', executable: 'Code.exe',
      startedAt: '2026-08-01T10:00:00.000Z', endedAt: '2026-08-01T10:02:00.000Z', durationSeconds: 120,
    },
    {
      sourceKind: 'activitywatch', sourceRecordId: 'two', appName: 'Chrome', executable: 'chrome.exe',
      startedAt: '2026-08-01T10:02:00.000Z', endedAt: '2026-08-01T10:03:00.000Z', durationSeconds: 60,
    },
  ],
  recoveredEvents: [{
    appName: 'Blender', eventType: 'installed', occurredAt: '2026-07-20T00:00:00.000Z',
    sourceKind: 'windows_installed_apps', confidence: 'medium', detail: 'Install date reported by Windows.',
  }],
  warnings: [],
  coverage: { start: '2026-07-20T00:00:00.000Z', end: '2026-08-01T10:03:00.000Z' },
});

describe('HistoryImportService', () => {
  it('commits a preview atomically and makes repeated imports idempotent', async () => {
    const repository = createRepository();
    const service = new HistoryImportService(repository);

    await expect(service.commit(preview())).resolves.toMatchObject({ importedSessions: 2, duplicates: 0, recoveredEvents: 1 });
    await expect(service.commit(preview())).resolves.toMatchObject({ importedSessions: 0, duplicates: 2, recoveredEvents: 0 });
    expect(repository.getAllSessions()).toHaveLength(2);
    expect(repository.listRecoveredEvents()).toHaveLength(1);
  });

  it('commits nothing when any exact session is invalid', async () => {
    const repository = createRepository();
    const service = new HistoryImportService(repository);
    const invalid = preview();
    invalid.exactSessions[1] = { ...invalid.exactSessions[1], durationSeconds: -1 };

    await expect(service.commit(invalid)).rejects.toThrow(/invalid-duration/i);
    expect(repository.getAllSessions()).toHaveLength(0);
    expect(repository.listRecoveredEvents()).toHaveLength(0);
  });

  it('deduplicates old clues when a later export grows and gets a new fingerprint', async () => {
    const repository = createRepository();
    const service = new HistoryImportService(repository);
    const first = preview();
    first.exactSessions = [];
    first.sourceFingerprint = 'sha256:first-export';
    const second = preview();
    second.exactSessions = [];
    second.sourceFingerprint = 'sha256:growing-export';
    second.recoveredEvents.push({
      appName: 'Figma', eventType: 'context', occurredAt: '2026-07-21T00:00:00.000Z',
      sourceKind: 'wakatime', confidence: 'high', detail: 'design.tsx was edited.',
    });

    await expect(service.commit(first)).resolves.toMatchObject({ recoveredEvents: 1 });
    await expect(service.commit(second)).resolves.toMatchObject({ recoveredEvents: 1 });
    expect(repository.listRecoveredEvents()).toHaveLength(2);
  });
});
