import { describe, expect, it } from 'vitest';
import { createTestApi } from '../test-utils/create-test-api';
import { buildRecapHeading, buildRecapScenes, formatRecapTotal } from './recap-scenes';

describe('buildRecapScenes', () => {
  it('keeps the core story grounded in a non-empty summary', async () => {
    const api = createTestApi();
    const year = new Date().getFullYear();
    const summary = await api.getSummary('year', year);

    expect(buildRecapScenes(summary, [])).toEqual([
      'cover',
      'total',
      'favorite',
      'categories',
      'memory',
      'relationship',
      'lifecycle',
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

    expect(buildRecapScenes(summary, timeline)).toContain('sprint');
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

    expect(buildRecapScenes(enriched, [])).toEqual(expect.arrayContaining(['era', 'memory']));
    expect(buildRecapScenes({ ...enriched, eras: [], observations: [] }, [])).not.toEqual(expect.arrayContaining(['era', 'memory']));
  });

  it('adds a performance story only after enough real samples exist', async () => {
    const api = createTestApi();
    const summary = await api.getSummary('year', new Date().getFullYear());
    expect(buildRecapScenes({ ...summary, performance: {
      sampleCount: 6, cpuSampleCount: 6, cpuPeak: 88, memorySampleCount: 6, highLoadSeconds: 120,
    } }, [])).toContain('system');
    expect(buildRecapScenes({ ...summary, performance: {
      sampleCount: 5, cpuSampleCount: 5, cpuPeak: 88, memorySampleCount: 5, highLoadSeconds: 120,
    } }, [])).not.toContain('system');
  });

  it('uses minutes for a young archive instead of displaying zero hours', () => {
    expect(formatRecapTotal(30)).toEqual({ value: '<1', unit: 'minute' });
    expect(formatRecapTotal(120)).toEqual({ value: '2', unit: 'minutes' });
    expect(formatRecapTotal(5_400)).toEqual({ value: '2', unit: 'hours' });
  });

  it('uses present tense for an open period and retrospective tense once complete', () => {
    expect(buildRecapHeading({ kind: 'year', start: '2026-01-01T00:00:00.000Z', end: '2026-08-15T00:00:00.000Z', label: '2026', complete: false })).toBe('Your 2026 so far.');
    expect(buildRecapHeading({ kind: 'year', start: '2025-01-01T00:00:00.000Z', end: '2026-01-01T00:00:00.000Z', label: '2025', complete: true })).toBe('This was your 2025.');
  });
});
