import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export async function readBoundedFile(path: string, maxBytes = MAX_IMPORT_BYTES): Promise<Buffer> {
  const details = await stat(path);
  if (!details.isFile()) throw new Error('Choose a history export file.');
  if (details.size > maxBytes) throw new Error(`History export is too large. Maximum size is ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  return readFile(path);
}

export function fingerprintBuffer(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

export function coverageFor(intervals: Array<{ startedAt: string; endedAt: string }>): { start: string; end: string } | undefined {
  if (intervals.length === 0) return undefined;
  return {
    start: intervals.reduce((earliest, item) => item.startedAt < earliest ? item.startedAt : earliest, intervals[0].startedAt),
    end: intervals.reduce((latest, item) => item.endedAt > latest ? item.endedAt : latest, intervals[0].endedAt),
  };
}
