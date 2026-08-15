// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportPreview, HistoryImporter } from './importers/types';
import { HistoryRecoveryService } from './history-recovery-service';

const preview: ImportPreview = {
  sourceKind: 'wakatime', sourceFingerprint: 'fingerprint', sourceLabel: 'Export',
  exactSessions: [], recoveredEvents: [{
    appName: 'Code', eventType: 'context', occurredAt: '2026-08-01T10:00:00.000Z',
    sourceKind: 'wakatime', confidence: 'medium', detail: 'A redacted project activity clue.',
  }], warnings: [],
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HistoryRecoveryService preview lifetime', () => {
  it('rejects a commit after the fifteen-minute preview lifetime', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
    const importer = { commit: vi.fn() };
    const adapter: HistoryImporter = { kind: 'wakatime', canRead: async () => true, preview: async () => preview };
    const service = new HistoryRecoveryService(importer as never, [adapter]);
    const view = await service.previewFile('wakatime.json');
    vi.advanceTimersByTime(15 * 60 * 1_000 + 1);

    await expect(service.commit(view.id)).rejects.toThrow(/expired/i);
    expect(importer.commit).not.toHaveBeenCalled();
  });

  it('clears stored previews and invalidates a preview still being parsed', async () => {
    let resolvePreview!: (value: ImportPreview) => void;
    const parsing = new Promise<ImportPreview>((resolve) => { resolvePreview = resolve; });
    const adapter: HistoryImporter = { kind: 'wakatime', canRead: async () => true, preview: () => parsing };
    const service = new HistoryRecoveryService({ commit: vi.fn() } as never, [adapter]);
    const pending = service.previewFile('wakatime.json');
    await vi.waitFor(() => expect(resolvePreview).toBeTypeOf('function'));

    service.clearPreviews();
    resolvePreview(preview);

    await expect(pending).rejects.toThrow(/cleared/i);
  });

  it('prevents a cleared stored preview from being imported later', async () => {
    const importer = { commit: vi.fn() };
    const adapter: HistoryImporter = { kind: 'wakatime', canRead: async () => true, preview: async () => preview };
    const service = new HistoryRecoveryService(importer as never, [adapter]);
    const view = await service.previewFile('wakatime.json');

    service.clearPreviews();

    await expect(service.commit(view.id)).rejects.toThrow(/expired/i);
    expect(importer.commit).not.toHaveBeenCalled();
  });
});
