import { localDayKey } from '../calendar.js';
import type { ActivitySession, AppRelationship, RoutineSequence } from '../types.js';

interface RelationshipAccumulator {
  appA: string;
  appB: string;
  transitions: number;
  days: Set<string>;
  gaps: number[];
  aToB: number;
  bToA: number;
}

export function buildRelationships(sessions: ActivitySession[], maxGapSeconds = 600): AppRelationship[] {
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const relationships = new Map<string, RelationshipAccumulator>();
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.appId === current.appId) continue;
    const gap = Math.round((new Date(current.startedAt).getTime() - new Date(previous.endedAt).getTime()) / 1_000);
    if (gap < 0 || gap > maxGapSeconds) continue;
    const [appA, appB] = [previous.appName, current.appName].sort((a, b) => a.localeCompare(b));
    const key = `${appA}::${appB}`;
    const relationship = relationships.get(key) ?? {
      appA, appB, transitions: 0, days: new Set<string>(), gaps: [], aToB: 0, bToA: 0,
    };
    relationship.transitions += 1;
    relationship.days.add(localDayKey(current.startedAt));
    relationship.gaps.push(gap);
    if (previous.appName === appA) relationship.aToB += 1;
    else relationship.bToA += 1;
    relationships.set(key, relationship);
  }
  return [...relationships.values()].map((item) => {
    const gaps = item.gaps.sort((a, b) => a - b);
    const middle = Math.floor(gaps.length / 2);
    const medianGapSeconds = gaps.length % 2 ? gaps[middle] : Math.round((gaps[middle - 1] + gaps[middle]) / 2);
    const direction = item.aToB === item.bToA ? 'balanced' : item.aToB > item.bToA ? 'a-to-b' : 'b-to-a';
    return {
      appA: item.appA,
      appB: item.appB,
      transitions: item.transitions,
      distinctDays: item.days.size,
      medianGapSeconds,
      direction,
      score: item.transitions * Math.max(1, item.days.size),
    } satisfies AppRelationship;
  }).sort((a, b) => b.score - a.score || `${a.appA}${a.appB}`.localeCompare(`${b.appA}${b.appB}`));
}

export function detectRoutines(sessions: ActivitySession[], maxGapSeconds = 600): RoutineSequence[] {
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const found = new Map<string, { apps: string[]; occurrences: number; days: Set<string> }>();
  for (const length of [3, 2]) {
    for (let start = 0; start + length <= ordered.length; start += 1) {
      const window = ordered.slice(start, start + length);
      if (window.some((session, index) => index > 0 && (
        session.appId === window[index - 1].appId
        || new Date(session.startedAt).getTime() - new Date(window[index - 1].endedAt).getTime() > maxGapSeconds * 1_000
        || new Date(session.startedAt).getTime() < new Date(window[index - 1].endedAt).getTime()
      ))) continue;
      const apps = window.map((session) => session.appName);
      const key = apps.join('→');
      const item = found.get(key) ?? { apps, occurrences: 0, days: new Set<string>() };
      item.occurrences += 1;
      item.days.add(localDayKey(window[0].startedAt));
      found.set(key, item);
    }
  }
  return [...found.values()]
    .filter((item) => item.occurrences >= 2 && item.days.size >= 2)
    .map((item) => ({ apps: item.apps, occurrences: item.occurrences, distinctDays: item.days.size, score: item.occurrences * item.days.size * item.apps.length }))
    .sort((a, b) => b.score - a.score || b.apps.length - a.apps.length);
}
