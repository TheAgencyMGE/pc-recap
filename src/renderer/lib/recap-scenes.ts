import type { PeriodSummary, TimelineBucket } from '../../shared/types';

export type RecapSceneId =
  | 'cover'
  | 'total'
  | 'favorite'
  | 'categories'
  | 'sprint'
  | 'era'
  | 'memory'
  | 'record'
  | 'finale';

export function buildRecapScenes(summary: PeriodSummary, timeline: TimelineBucket[]): RecapSceneId[] {
  const scenes: RecapSceneId[] = ['cover', 'total'];
  if (summary.topApps.length) scenes.push('favorite');
  if (summary.categories.some((category) => category.seconds > 0)) scenes.push('categories');
  if (timeline.filter((bucket) => bucket.seconds > 0).length >= 2) scenes.push('sprint');
  if (summary.eras.length) scenes.push('era');
  if (summary.observations.length) scenes.push('memory');
  if (summary.longestSession) scenes.push('record');
  scenes.push('finale');
  return scenes;
}

export function formatRecapTotal(seconds: number) {
  if (seconds < 3_600) {
    const value = Math.max(1, Math.round(seconds / 60));
    return { value: value.toLocaleString(), unit: value === 1 ? 'minute' : 'minutes' };
  }
  const value = Math.round(seconds / 3_600);
  return { value: value.toLocaleString(), unit: value === 1 ? 'hour' : 'hours' };
}
