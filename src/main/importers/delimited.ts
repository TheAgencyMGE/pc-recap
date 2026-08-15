import type { SessionSourceKind } from '../../shared/types.js';
import type { ImportedExactSession } from './types.js';

export type DelimitedRecord = Record<string, string>;

const MAX_ROWS = 1_000_000;

export function parseDelimited(input: string): DelimitedRecord[] {
  const delimiter = detectDelimiter(input);
  const rows = parseRows(input, delimiter);
  if (rows.length === 0) return [];
  if (rows.length - 1 > MAX_ROWS) throw new Error('History export contains too many records.');
  const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, ''));
  return rows.slice(1)
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ''])));
}

export function recordsToExactSessions(records: DelimitedRecord[], sourceKind: SessionSourceKind): ImportedExactSession[] {
  return records.flatMap((record, index) => {
    const startedAt = readDate(record, ['Start', 'Start Time', 'Started At', 'From', 'start']);
    const endedAt = readDate(record, ['End', 'End Time', 'Ended At', 'To', 'end']);
    const appName = readValue(record, ['Application', 'App', 'Activity', 'Name', 'Window']);
    if (!startedAt || !endedAt || !appName || Date.parse(endedAt) <= Date.parse(startedAt)) return [];
    const executable = readValue(record, ['Executable', 'Process', 'Process Name', 'Exe']) || executableFor(appName);
    return [{
      sourceKind,
      sourceRecordId: readValue(record, ['Id', 'ID', 'Event ID']) || `row-${index + 1}:${startedAt}:${endedAt}:${executable}`,
      appName,
      executable,
      startedAt,
      endedAt,
      durationSeconds: Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1_000),
      windowTitle: readValue(record, ['Title', 'Window Title']) || undefined,
    }];
  });
}

export function readValue(record: DelimitedRecord, names: string[]): string {
  const byLowerCase = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase().trim(), value]));
  for (const name of names) {
    const value = byLowerCase.get(name.toLowerCase());
    if (value?.trim()) return value.trim();
  }
  return '';
}

function readDate(record: DelimitedRecord, names: string[]): string | undefined {
  const value = readValue(record, names);
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function executableFor(appName: string) {
  return `${appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown-app'}.exe`;
}

function detectDelimiter(input: string) {
  const firstLine = input.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', '\t', ';'];
  return candidates.sort((a, b) => countOutsideQuotes(firstLine, b) - countOutsideQuotes(firstLine, a))[0];
}

function countOutsideQuotes(line: string, token: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === token) count += 1;
  }
  return count;
}

function parseRows(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
