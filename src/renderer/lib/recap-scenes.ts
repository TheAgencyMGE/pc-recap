import type { MemoryPin, PeriodSummary, RecapSelection, RecoveredEvent, TimelineBucket } from '../../shared/types';

export type RecapSceneId =
  | 'cover'
  | 'total'
  | 'favorite'
  | 'categories'
  | 'sprint'
  | 'era'
  | 'memory'
  | 'system'
  | 'record'
  | 'relationship'
  | 'rhythm'
  | 'lifecycle'
  | 'clue'
  | 'pin'
  | 'finale';

export function buildRecapScenes(summary: PeriodSummary, timeline: TimelineBucket[], extras: { recoveredClues?: RecoveredEvent[]; pins?: MemoryPin[] } = {}): RecapSceneId[] {
  const scenes: RecapSceneId[] = ['cover', 'total'];
  if (summary.topApps.length) scenes.push('favorite');
  if (summary.categories.some((category) => category.seconds > 0)) scenes.push('categories');
  if (timeline.filter((bucket) => bucket.seconds > 0).length >= 2) scenes.push('sprint');
  if (summary.eras.length) scenes.push('era');
  if (summary.observations.length) scenes.push('memory');
  if (summary.performance && summary.performance.sampleCount >= 6) scenes.push('system');
  if (summary.relationships.length) scenes.push('relationship');
  if (summary.routines.length) scenes.push('rhythm');
  if (summary.lifecycle.length) scenes.push('lifecycle');
  if (extras.recoveredClues?.length) scenes.push('clue');
  if (extras.pins?.some((pin) => pin.includeInRecaps)) scenes.push('pin');
  if (summary.longestSession) scenes.push('record');
  scenes.push('finale');
  return scenes;
}

export function buildRecapHeading(selection: RecapSelection) {
  return selection.complete ? `This was your ${selection.label}.` : `Your ${selection.label} so far.`;
}

export function formatRecapTotal(seconds: number) {
  if (seconds < 3_600) {
    if (seconds > 0 && seconds < 60) return { value: '<1', unit: 'minute' };
    const value = Math.max(1, Math.round(seconds / 60));
    return { value: value.toLocaleString(), unit: value === 1 ? 'minute' : 'minutes' };
  }
  const value = Math.round(seconds / 3_600);
  return { value: value.toLocaleString(), unit: value === 1 ? 'hour' : 'hours' };
}
