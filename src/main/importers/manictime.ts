import Database from 'better-sqlite3';
import { extname } from 'node:path';
import { parseDelimited, recordsToExactSessions, type DelimitedRecord } from './delimited.js';
import { coverageFor, fingerprintBuffer, readBoundedFile } from './file-utils.js';
import type { HistoryImporter, ImportPreview } from './types.js';

export class ManicTimeImporter implements HistoryImporter {
  readonly kind = 'manictime';

  async canRead(path: string) {
    return ['.csv', '.tsv', '.txt', '.db', '.sqlite', '.sqlite3'].includes(extname(path).toLowerCase());
  }

  async preview(path: string): Promise<ImportPreview> {
    const extension = extname(path).toLowerCase();
    const buffer = await readBoundedFile(path);
    const records = ['.db', '.sqlite', '.sqlite3'].includes(extension)
      ? readConcreteIntervalsFromDatabase(path)
      : parseDelimited(buffer.toString('utf8'));
    const exactSessions = recordsToExactSessions(records, 'manictime');
    return {
      sourceKind: this.kind,
      sourceFingerprint: fingerprintBuffer(buffer),
      sourceLabel: 'ManicTime export',
      exactSessions,
      recoveredEvents: [],
      warnings: exactSessions.length ? [] : ['No rows with concrete start and end times were found.'],
      coverage: coverageFor(exactSessions),
    };
  }
}

function readConcreteIntervalsFromDatabase(path: string): DelimitedRecord[] {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const tables = database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as Array<{ name: string }>;
    for (const { name } of tables.slice(0, 200)) {
      const safeName = name.replaceAll('"', '""');
      const columns = database.prepare(`PRAGMA table_info("${safeName}")`).all() as Array<{ name: string }>;
      const names = new Set(columns.map((column) => column.name.toLowerCase()));
      if (!hasAny(names, ['start', 'starttime', 'start time', 'from']) || !hasAny(names, ['end', 'endtime', 'end time', 'to'])) continue;
      const rows = database.prepare(`SELECT * FROM "${safeName}" LIMIT 200001`).all() as DelimitedRecord[];
      if (rows.length > 200_000) throw new Error('ManicTime database contains too many rows for one import.');
      return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? '')])));
    }
    return [];
  } finally {
    database.close();
  }
}

function hasAny(values: Set<string>, candidates: string[]) {
  return candidates.some((candidate) => values.has(candidate));
}
