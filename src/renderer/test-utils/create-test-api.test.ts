import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestApi } from './create-test-api';

describe('createTestApi', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps its current-day fixture populated before the sample session hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 2));

    const summary = await createTestApi().getSummary('today');

    expect(summary.topApps.map((app) => app.name)).toEqual(['Visual Studio Code', 'Browser']);
    expect(summary.totalSeconds).toBe(5_400);
  });
});
