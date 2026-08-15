import type { ActivitySession, LifecycleMoment } from '../types.js';

const DAY = 86_400_000;

export function detectLifecycleMoments(sessions: ActivitySession[], now = new Date()): LifecycleMoment[] {
  const byApp = new Map<string, ActivitySession[]>();
  for (const session of sessions) byApp.set(session.appId, [...(byApp.get(session.appId) ?? []), session]);
  const moments: LifecycleMoment[] = [];
  for (const appSessions of byApp.values()) {
    const ordered = [...appSessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const first = ordered[0];
    const last = ordered.at(-1)!;
    const totalSeconds = ordered.reduce((sum, item) => sum + item.durationSeconds, 0);
    if (now.getTime() - new Date(first.startedAt).getTime() <= 30 * DAY) {
      moments.push(moment('first-use', first, first.startedAt));
    }
    for (let index = 1; index < ordered.length; index += 1) {
      const gapDays = Math.ceil((new Date(ordered[index].startedAt).getTime() - new Date(ordered[index - 1].endedAt).getTime()) / DAY);
      if (gapDays >= 30) moments.push({ ...moment('comeback', ordered[index], ordered[index].startedAt), gapDays });
    }
    const absentDays = Math.floor((now.getTime() - new Date(last.endedAt).getTime()) / DAY);
    if (absentDays >= 60 && totalSeconds >= 1_800) moments.push({ ...moment('abandoned', last, last.endedAt), gapDays: absentDays });
    if (ordered.length === 1 && totalSeconds <= 2_700 && absentDays >= 30) moments.push({ ...moment('brief-fling', last, last.endedAt), gapDays: absentDays });
  }
  return moments.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.appName.localeCompare(b.appName));
}

function moment(kind: LifecycleMoment['kind'], session: ActivitySession, occurredAt: string): LifecycleMoment {
  return { kind, appId: session.appId, appName: session.appName, occurredAt };
}
