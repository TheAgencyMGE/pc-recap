// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseDelimited, recordsToExactSessions } from './delimited';

describe('delimited history parsing', () => {
  it('handles quoted fields and concrete start/end intervals', () => {
    const records = parseDelimited('Start,End,Application,Executable\n"2026-08-01T10:00:00Z","2026-08-01T10:01:00Z","Visual Studio Code","Code.exe"');
    expect(records).toEqual([expect.objectContaining({ Application: 'Visual Studio Code', Executable: 'Code.exe' })]);
    expect(recordsToExactSessions(records, 'manictime')).toEqual([expect.objectContaining({
      appName: 'Visual Studio Code', durationSeconds: 60, sourceKind: 'manictime',
    })]);
  });

  it('does not turn aggregate rows into exact usage sessions', () => {
    const records = parseDelimited('Date,Time Spent (seconds),Activity\n2026-08-01,60,Chrome');
    expect(records).toHaveLength(1);
    expect(recordsToExactSessions(records, 'rescuetime')).toEqual([]);
  });
});
