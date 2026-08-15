import type { ImportedExactSession } from './types.js';

export type ImportedSessionValidation =
  | { ok: true; value: ImportedExactSession }
  | { ok: false; reason: 'invalid-duration' | 'invalid-interval' | 'invalid-identity' | 'invalid-source' };

const MAX_SESSION_SECONDS = 7 * 24 * 60 * 60;

export function validateImportedSession(session: ImportedExactSession): ImportedSessionValidation {
  if (!Number.isFinite(session.durationSeconds) || session.durationSeconds < 0 || session.durationSeconds > MAX_SESSION_SECONDS) {
    return { ok: false, reason: 'invalid-duration' };
  }
  if (!session.sourceRecordId?.trim() || !session.sourceKind) return { ok: false, reason: 'invalid-source' };
  if (!session.appName?.trim() || !session.executable?.trim() || session.appName.length > 300 || session.executable.length > 300) {
    return { ok: false, reason: 'invalid-identity' };
  }
  const start = Date.parse(session.startedAt);
  const end = Date.parse(session.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { ok: false, reason: 'invalid-interval' };
  const intervalSeconds = (end - start) / 1_000;
  if (intervalSeconds > MAX_SESSION_SECONDS || Math.abs(intervalSeconds - session.durationSeconds) > Math.max(2, intervalSeconds * 0.05)) {
    return { ok: false, reason: 'invalid-interval' };
  }
  return {
    ok: true,
    value: {
      ...session,
      sourceRecordId: session.sourceRecordId.trim(),
      appName: session.appName.trim(),
      executable: session.executable.trim(),
      durationSeconds: Math.round(session.durationSeconds),
      windowTitle: session.windowTitle?.slice(0, 2_048),
    },
  };
}
