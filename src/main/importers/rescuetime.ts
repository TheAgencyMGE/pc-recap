import { extname } from 'node:path';
import type { RecoveredEventInput } from '../../shared/types.js';
import { parseDelimited, readValue, recordsToExactSessions } from './delimited.js';
import { coverageFor, fingerprintBuffer, readBoundedFile } from './file-utils.js';
import type { HistoryImporter, ImportPreview } from './types.js';

export class RescueTimeImporter implements HistoryImporter {
  readonly kind = 'rescuetime';

  async canRead(path: string) {
    return ['.csv', '.tsv', '.txt'].includes(extname(path).toLowerCase());
  }

  async preview(path: string): Promise<ImportPreview> {
    const buffer = await readBoundedFile(path);
    const records = parseDelimited(buffer.toString('utf8'));
    const exactSessions = recordsToExactSessions(records, 'rescuetime');
    const exactRecordIds = new Set(exactSessions.map((session) => session.sourceRecordId));
    const recoveredEvents: RecoveredEventInput[] = records.flatMap((record, index) => {
      const date = readValue(record, ['Date', 'Day']);
      const appName = readValue(record, ['Activity', 'Application', 'App']);
      const recordIdPrefix = `row-${index + 1}:`;
      if (!date || !appName || [...exactRecordIds].some((id) => id.startsWith(recordIdPrefix))) return [];
      const occurredAt = dateAtNoon(date);
      if (!occurredAt) return [];
      const seconds = Number(readValue(record, ['Time Spent (seconds)', 'Time Spent', 'Seconds', 'Duration']));
      return [{
        appName,
        eventType: 'context' as const,
        occurredAt,
        sourceKind: 'rescuetime',
        confidence: 'medium' as const,
        detail: Number.isFinite(seconds) && seconds > 0
          ? `RescueTime reported ${Math.round(seconds / 60)} minutes on this date. This does not add foreground usage time.`
          : 'RescueTime reported this activity on this date. This does not add foreground usage time.',
      }];
    });
    return {
      sourceKind: this.kind,
      sourceFingerprint: fingerprintBuffer(buffer),
      sourceLabel: 'RescueTime export',
      exactSessions,
      recoveredEvents,
      warnings: recoveredEvents.length ? ['Date-only RescueTime rows are kept as context and do not add usage time.'] : [],
      coverage: coverageFor(exactSessions),
    };
  }
}

function dateAtNoon(value: string): string | undefined {
  const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}
