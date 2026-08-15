import type { RecoveredEventInput, SessionSourceKind } from '../../shared/types.js';

export interface ImportedExactSession {
  sourceKind: SessionSourceKind;
  sourceRecordId: string;
  appName: string;
  executable: string;
  path?: string;
  categoryId?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  windowTitle?: string;
  machineId?: string;
}

export interface ImportPreview {
  sourceKind: string;
  sourceFingerprint: string;
  sourceLabel: string;
  exactSessions: ImportedExactSession[];
  recoveredEvents: RecoveredEventInput[];
  warnings: string[];
  coverage?: { start: string; end: string };
}

export interface HistoryImporter {
  readonly kind: string;
  canRead(path: string): Promise<boolean>;
  preview(path: string): Promise<ImportPreview>;
}

export interface ImportCommitResult {
  importedSessions: number;
  duplicates: number;
  recoveredEvents: number;
  batchId?: string;
}
