import { describe, expect, it } from 'vitest';
import { createTestApi } from '../test-utils/create-test-api';
import { buildWrappedScenes, formatWrappedTotal } from './wrapped-scenes';

describe('buildWrappedScenes', () => {
  it('keeps the core story grounded in a non-empty summary', async () => {
    const api = createTestApi();
    const year = new Date().getFullYear();
    const summary = await api.getSummary('year', year);

    expect(buildWrappedScenes(summary, [])).toEqual([
      'cover',
      'total',
      'favorite',
      'categories',
      'memory',
      'record',
      'finale',
    ]);
  });

  it('adds a month sprint only when multiple populated months can be compared', async () => {
    const api = createTestApi();
    const year = new Date().getFullYear();
    const summary = await api.getSummary('year', year);
    const timeline = [
      { key: `${year}-01`, label: 'January', seconds: 100, topApp: 'Code', categoryId: 'coding', intensity: 0.4 },
      { key: `${year}-02`, label: 'February', seconds: 300, topApp: 'Browser', categoryId: 'browsing', intensity: 1 },
    ];

    expect(buildWrappedScenes(summary, timeline)).toContain('sprint');
  });

  it('only includes era and memory scenes when those facts exist', async () => {
    const api = createTestApi();
    const year = new Date().getFullYear();
    const summary = await api.getSummary('year', year);
    const enriched = {
      ...summary,
      eras: [{ id: 'era-1', title: 'The Code Era', subtitle: 'A sustained run.', start: `${year}-01`, end: `${year}-03`, appId: 'code', color: '#355CFF' }],
      observations: [{ id: 'obs-1', eyebrow: 'NIGHT OWL', text: 'Your late-night app was Code.', detail: 'Based on recorded sessions.', accent: '#9189FF', priority: 1 }],
    };

    expect(buildWrappedScenes(enriched, [])).toEqual(expect.arrayContaining(['era', 'memory']));
    expect(buildWrappedScenes({ ...enriched, eras: [], observations: [] }, [])).not.toEqual(expect.arrayContaining(['era', 'memory']));
  });

  it('uses minutes for a young archive instead of displaying zero hours', () => {
    expect(formatWrappedTotal(120)).toEqual({ value: '2', unit: 'minutes' });
    expect(formatWrappedTotal(5_400)).toEqual({ value: '2', unit: 'hours' });
  });
});
