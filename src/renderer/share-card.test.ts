import { describe, expect, it } from 'vitest';
import { createTestApi } from './test-utils/create-test-api';
import * as shareCard from './lib/share-card';

const { getShareCardDimensions, getShareCardModel } = shareCard;

describe('getShareCardModel', () => {
  it('turns a yearly summary into stable card copy', async () => {
    const api = createTestApi();
    const year = new Date().getFullYear();
    const summary = await api.getSummary('year', year);

    expect(getShareCardModel(summary)).toEqual({
      year: String(year),
      hours: Math.round(summary.totalSeconds / 3600).toLocaleString(),
      favorite: summary.topApps[0].name,
      favoriteHours: Math.round(summary.topApps[0].seconds / 3600).toLocaleString(),
      apps: summary.topApps.slice(0, 3).map((app) => app.name),
      observation: summary.observations[0].text,
    });
  });

  it('uses social portrait dimensions instead of a website banner', () => {
    expect(getShareCardDimensions('portrait')).toEqual({ width: 1080, height: 1350 });
    expect(getShareCardDimensions('story')).toEqual({ width: 1080, height: 1920 });
  });

  it('saves new share cards under the PC Recap brand', async () => {
    const api = createTestApi();
    const summary = await api.getSummary('year', 2026);
    const getShareCardFileName = (shareCard as typeof shareCard & {
      getShareCardFileName(summaryLabel: string, format: 'portrait' | 'story'): string;
    }).getShareCardFileName;

    expect(getShareCardFileName(summary.label, 'portrait')).toBe('PC-Recap-2026-portrait.png');
  });

  it('does not invent an observation when the summary has none', async () => {
    const api = createTestApi();
    const summary = await api.getSummary('year', new Date().getFullYear());
    expect(getShareCardModel({ ...summary, observations: [] }).observation).toBe('');
  });
});
