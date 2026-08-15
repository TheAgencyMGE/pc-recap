// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ImportedExactSession } from './types';
import { validateImportedSession } from './validate';

const exactSession = (patch: Partial<ImportedExactSession> = {}): ImportedExactSession => ({
  sourceKind: 'activitywatch',
  sourceRecordId: 'event-1',
  appName: 'Visual Studio Code',
  executable: 'Code.exe',
  startedAt: '2026-08-01T10:00:00.000Z',
  endedAt: '2026-08-01T10:02:00.000Z',
  durationSeconds: 120,
  ...patch,
});

describe('history import validation', () => {
  it('rejects impossible durations and intervals', () => {
    expect(validateImportedSession(exactSession({ durationSeconds: -1 }))).toEqual({ ok: false, reason: 'invalid-duration' });
    expect(validateImportedSession(exactSession({ endedAt: '2026-08-01T09:59:00.000Z' }))).toEqual({ ok: false, reason: 'invalid-interval' });
  });

  it('accepts bounded exact sessions while normalizing duration rounding', () => {
    expect(validateImportedSession(exactSession({ durationSeconds: 119.6 }))).toEqual({
      ok: true,
      value: exactSession({ durationSeconds: 120 }),
    });
  });
});
