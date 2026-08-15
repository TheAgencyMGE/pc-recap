import { createHash } from 'node:crypto';
import { categoryForApplication } from '../activity-source.js';
import type { ActivityRepository, HistoryBatchInput } from '../database.js';
import { normalizeApplication } from '../tracking/app-identity.js';
import type { ImportCommitResult, ImportPreview } from './types.js';
import { validateImportedSession } from './validate.js';

export class HistoryImportService {
  constructor(private readonly repository: ActivityRepository) {}

  async commit(preview: ImportPreview): Promise<ImportCommitResult> {
    if (!preview.sourceFingerprint.trim() || preview.exactSessions.length > 1_000_000 || preview.recoveredEvents.length > 1_000_000) {
      throw new Error('Import preview is outside the supported bounds.');
    }
    const exactSessions = preview.exactSessions.map((session) => {
      const validation = validateImportedSession(session);
      if (!validation.ok) throw new Error(`Import contains an invalid exact session: ${validation.reason}.`);
      const normalized = normalizeApplication({
        name: validation.value.appName,
        executable: validation.value.executable,
        path: validation.value.path,
        title: validation.value.windowTitle,
      });
      return {
        session: {
          id: stableId('session', `${validation.value.sourceKind}:${validation.value.sourceRecordId}`),
          appId: normalized.canonicalId,
          appName: normalized.canonicalName,
          categoryId: validation.value.categoryId ?? categoryForApplication(normalized),
          startedAt: validation.value.startedAt,
          endedAt: validation.value.endedAt,
          durationSeconds: validation.value.durationSeconds,
          windowTitle: validation.value.windowTitle,
          machineId: validation.value.machineId ?? `import:${validation.value.sourceKind}`,
          sourceKind: validation.value.sourceKind,
          confidence: 'imported_exact' as const,
          sourceRecordId: validation.value.sourceRecordId,
        },
        app: {
          executable: normalized.executable,
          path: normalized.path,
          color: undefined,
        },
      };
    });
    for (const event of preview.recoveredEvents) validateRecoveredEvent(event);
    const batchId = stableId('batch', preview.sourceFingerprint);
    const input: HistoryBatchInput = {
      batch: {
        id: batchId,
        sourceKind: preview.sourceKind,
        sourceFingerprint: preview.sourceFingerprint,
        importedAt: new Date().toISOString(),
        exactSessionCount: exactSessions.length,
        recoveredEventCount: preview.recoveredEvents.length,
      },
      sessions: exactSessions,
      recoveredEvents: preview.recoveredEvents.map((event, index) => ({
        ...event,
        id: stableId('event', `${preview.sourceFingerprint}:${event.sourceKind}:${event.occurredAt}:${event.appName}:${index}`),
        importBatchId: batchId,
      })),
    };
    return this.repository.commitHistoryBatch(input);
  }
}

function validateRecoveredEvent(event: ImportPreview['recoveredEvents'][number]) {
  if (!event.appName?.trim() || !event.sourceKind?.trim() || !Number.isFinite(Date.parse(event.occurredAt))) {
    throw new Error('Import contains an invalid recovered event.');
  }
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}
