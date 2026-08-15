import { extname } from 'node:path';
import type { RecoveredEventInput } from '../../shared/types.js';
import { parseDelimited, readValue } from './delimited.js';
import { fingerprintBuffer, readBoundedFile } from './file-utils.js';
import type { HistoryImporter, ImportPreview } from './types.js';

interface WakaTimeHeartbeat { time?: number | string; project?: string; entity?: string; duration?: number }

export class WakaTimeImporter implements HistoryImporter {
  readonly kind = 'wakatime';

  async canRead(path: string) {
    return ['.json', '.csv', '.tsv', '.txt'].includes(extname(path).toLowerCase());
  }

  async preview(path: string): Promise<ImportPreview> {
    const buffer = await readBoundedFile(path);
    const rows = extname(path).toLowerCase() === '.json'
      ? parseJson(buffer.toString('utf8'))
      : parseDelimited(buffer.toString('utf8')).map((record) => ({
        time: readValue(record, ['Time', 'Timestamp', 'Date']),
        project: readValue(record, ['Project']),
        entity: readValue(record, ['Entity', 'File']),
        duration: Number(readValue(record, ['Duration', 'Seconds'])),
      }));
    const recoveredEvents: RecoveredEventInput[] = rows.flatMap((row) => {
      const occurredAt = parseWakaTime(row.time);
      const appName = row.project?.trim() || 'Coding activity';
      if (!occurredAt) return [];
      return [{
        appName,
        eventType: 'context' as const,
        occurredAt,
        sourceKind: 'wakatime',
        confidence: 'high' as const,
        detail: `${row.entity ? `${row.entity} was edited` : 'Coding was recorded'}${row.duration ? ` for about ${Math.round(row.duration)} seconds` : ''}. This does not add foreground usage time.`,
      }];
    });
    return {
      sourceKind: this.kind,
      sourceFingerprint: fingerprintBuffer(buffer),
      sourceLabel: 'WakaTime export',
      exactSessions: [],
      recoveredEvents,
      warnings: recoveredEvents.length ? ['WakaTime describes coding context, not foreground application time.'] : ['No WakaTime records were found.'],
    };
  }
}

function parseJson(input: string): WakaTimeHeartbeat[] {
  const parsed = JSON.parse(input) as WakaTimeHeartbeat[] | { data?: WakaTimeHeartbeat[] };
  const rows = Array.isArray(parsed) ? parsed : parsed.data ?? [];
  if (rows.length > 1_000_000) throw new Error('WakaTime export contains too many records.');
  return rows;
}

function parseWakaTime(value: WakaTimeHeartbeat['time']): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1_000).toISOString();
  if (typeof value !== 'string') return undefined;
  const numeric = Number(value);
  const timestamp = Number.isFinite(numeric) && value.trim() ? numeric * 1_000 : Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}
