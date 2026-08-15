import type { Observation, PeriodSummary } from './types.js';

const periodCopy = (kind: PeriodSummary['kind']) => ({
  today: 'today', week: 'this week', month: 'this month', year: 'this year',
  'all-time': 'all-time', decade: 'this decade',
} satisfies Record<PeriodSummary['kind'], string>)[kind];

const formatMinutes = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours} hours`;
};

export function generateObservations(summary: PeriodSummary): Observation[] {
  const observations: Observation[] = [];
  const twoAmSeconds = summary.hourly.find((bucket) => bucket.label === '2')?.seconds ?? 0;
  if (twoAmSeconds > 0) {
    const nightApp = summary.hourlyApps?.['2']
      || summary.topApps.find((app) => app.categoryId === 'social')?.name
      || summary.topApps[0]?.name;
    if (nightApp) {
      observations.push({
        id: 'night-owl',
        eyebrow: 'After midnight',
        text: `Your 2 AM app was ${nightApp}.`,
        detail: `${formatMinutes(twoAmSeconds)} lived in that small hour.`,
        accent: '#8D87FF',
        priority: 100,
      });
    }
  }

  const strongestChange = summary.topApps
    .map((app) => ({
      ...app,
      previousSeconds: app.previousSeconds ?? (
        app.changePercent !== undefined && app.changePercent !== -100
          ? Math.round(app.seconds / (1 + app.changePercent / 100))
          : 0
      ),
    }))
    .filter((app) => app.changePercent !== undefined
      && Math.abs(app.changePercent) >= 10
      && app.seconds >= 600
      && Math.abs(app.seconds - app.previousSeconds) >= 600)
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))[0];
  if (strongestChange?.changePercent !== undefined) {
    const direction = strongestChange.changePercent >= 0 ? 'increased' : 'fell';
    const hasStableBaseline = strongestChange.previousSeconds >= 600;
    observations.push({
      id: `change-${strongestChange.appId}`,
      eyebrow: 'Plot twist',
      text: hasStableBaseline
        ? `${strongestChange.name} usage ${direction} ${Math.abs(strongestChange.changePercent)}% ${periodCopy(summary.kind)}.`
        : `${strongestChange.name} went from ${formatMinutes(strongestChange.previousSeconds)} to ${formatMinutes(strongestChange.seconds)} ${periodCopy(summary.kind)}.`,
      detail: `${formatMinutes(strongestChange.seconds)} in the current chapter.`,
      accent: strongestChange.color,
      priority: 90,
    });
  }

  const pair = summary.appPairs[0];
  if (pair && pair.daysTogether >= 2) {
    const relationship = summary.relationships.find((item) => samePair(item, pair));
    observations.push({
      id: `pair-${pair.appA}-${pair.appB}`,
      eyebrow: 'Always together',
      text: `${pair.appA} + ${pair.appB} were your power couple.`,
      detail: relationship
        ? `You switched between them ${relationship.transitions} times across ${relationship.distinctDays} days.`
        : `They appeared together across ${pair.daysTogether} active days.`,
      accent: '#5AB7FF',
      priority: 80,
    });
  }

  if (summary.longestSession) {
    observations.push({
      id: 'deep-dive',
      eyebrow: 'Deep dive',
      text: `${summary.longestSession.appName} held your attention the longest.`,
      detail: `${formatMinutes(summary.longestSession.durationSeconds)} without switching away.`,
      accent: '#F2C66D',
      priority: 60,
    });
  }

  if (!observations.length) {
    observations.push({
      id: 'quiet-archive',
      eyebrow: 'A quiet chapter',
      text: 'Your archive is waiting for its next memory.',
      detail: 'Keep tracking on and this space will tell the story.',
      accent: '#8D87FF',
      priority: 1,
    });
  }

  return observations.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function samePair(
  left: Pick<PeriodSummary['relationships'][number], 'appA' | 'appB'>,
  right: Pick<PeriodSummary['appPairs'][number], 'appA' | 'appB'>,
) {
  return (left.appA === right.appA && left.appB === right.appB)
    || (left.appA === right.appB && left.appB === right.appA);
}
