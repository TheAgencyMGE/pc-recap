import { describe, expect, it } from 'vitest';
import type { PeriodKind } from '../../shared/types';
import { createTestApi } from '../test-utils/create-test-api';
import { buildAppCovers, buildArchiveCovers, buildRecapCovers } from './collection-covers';

describe('collection cover models', () => {
  it('builds the recap shelf in period order from real summaries', async () => {
    const api = createTestApi();
    const year = new Date().getFullYear();
    const kinds: PeriodKind[] = ['today', 'week', 'month', 'year', 'all-time', 'decade'];
    const summaries = Object.fromEntries(await Promise.all(kinds.map(async (kind) => [kind, await api.getSummary(kind, kind === 'year' ? year : undefined)])));

    const covers = buildRecapCovers(summaries);

    expect(covers.map((cover) => cover.route)).toEqual(kinds);
    expect(covers[0]).toEqual(expect.objectContaining({ title: 'Today', value: expect.any(String) }));
    expect(covers).toEqual(buildRecapCovers(summaries));
  });

  it('omits values when a recap has no recorded activity', async () => {
    const api = createTestApi();
    api.clearHistory();
    const summary = await api.getSummary('today');

    expect(buildRecapCovers({ today: summary })[0]).not.toHaveProperty('value');
    expect(buildRecapCovers({ today: summary })[0]).not.toHaveProperty('subtitle');
  });

  it('omits archive and app covers that have no real source items', () => {
    expect(buildArchiveCovers([], [], [])).toEqual([]);
    expect(buildAppCovers([], [])).toEqual([]);
  });

  it('uses real app usage for application covers', async () => {
    const api = createTestApi();
    const [apps, summary] = await Promise.all([api.listApps(), api.getSummary('all-time')]);
    const covers = buildAppCovers(apps, summary.topApps);

    expect(covers[0]).toEqual(expect.objectContaining({
      route: `app:${apps[0].id}`,
      appId: apps[0].id,
      title: apps[0].name,
      value: expect.any(String),
    }));
    expect(covers.at(-1)).toEqual(expect.objectContaining({ route: 'categories', title: 'Categories' }));
  });

  it('offers Recap Studio once the archive has recorded history', () => {
    const covers = buildArchiveCovers([{ key: '2026', label: '2026', seconds: 60, topApp: 'Code', categoryId: 'coding', intensity: 1 }], [], []);
    expect(covers[0]).toEqual(expect.objectContaining({ route: 'recap-studio', title: 'Recap Studio' }));
  });
});
