import { describe, expect, it } from 'vitest';
import { detectEras, summarizeSessions } from './analytics';
import type { ActivitySession } from './types';

const session = (
  id: string,
  appName: string,
  categoryId: string,
  startedAt: string,
  durationSeconds: number,
): ActivitySession => ({
  id,
  appId: appName.toLowerCase().replaceAll(' ', '-'),
  appName,
  categoryId,
  startedAt,
  endedAt: new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString(),
  durationSeconds,
});

describe('summarizeSessions', () => {
  it('calculates totals, rankings, active days and exact percent change', () => {
    const current = [
      session('1', 'VS Code', 'coding', '2025-01-01T09:00:00.000Z', 7_200),
      session('2', 'Chrome', 'browsing', '2025-01-01T12:00:00.000Z', 3_600),
      session('3', 'VS Code', 'coding', '2025-01-02T23:30:00.000Z', 1_800),
    ];
    const previous = [session('4', 'Chrome', 'browsing', '2024-12-30T10:00:00.000Z', 8_400)];

    const result = summarizeSessions(current, previous, {
      kind: 'week',
      label: 'This week',
      rangeStart: '2025-01-01T00:00:00.000Z',
      rangeEnd: '2025-01-08T00:00:00.000Z',
    });

    expect(result.totalSeconds).toBe(12_600);
    expect(result.changePercent).toBe(50);
    expect(result.activeDays).toBe(2);
    expect(result.topApps.map((app) => [app.name, app.seconds])).toEqual([
      ['VS Code', 9_000],
      ['Chrome', 3_600],
    ]);
    expect(result.longestSession?.id).toBe('1');
  });

  it('finds the strongest pair by shared active days', () => {
    const current = [
      session('1', 'VS Code', 'coding', '2025-01-01T09:00:00.000Z', 100),
      session('2', 'Chrome', 'browsing', '2025-01-01T09:10:00.000Z', 100),
      session('3', 'VS Code', 'coding', '2025-01-02T09:00:00.000Z', 100),
      session('4', 'Chrome', 'browsing', '2025-01-02T09:10:00.000Z', 100),
      session('5', 'Discord', 'social', '2025-01-02T10:00:00.000Z', 100),
    ];

    const result = summarizeSessions(current, [], {
      kind: 'week',
      label: 'This week',
      rangeStart: '2025-01-01T00:00:00.000Z',
      rangeEnd: '2025-01-08T00:00:00.000Z',
    });

    expect(result.appPairs[0]).toMatchObject({
      appA: 'Chrome',
      appB: 'VS Code',
      daysTogether: 2,
    });
  });

  it('splits a session across local calendar days and hours', () => {
    const start = new Date(2025, 0, 15, 23, 50);
    const current = [session('overnight', 'Discord', 'social', start.toISOString(), 1_200)];

    const result = summarizeSessions(current, [], {
      kind: 'today',
      label: 'Jan 15',
      rangeStart: new Date(2025, 0, 15).toISOString(),
      rangeEnd: new Date(2025, 0, 17).toISOString(),
    });

    expect(result.daily).toEqual([
      { label: '2025-01-15', seconds: 600, leadingApp: 'Discord', leadingCategory: 'Social' },
      { label: '2025-01-16', seconds: 600, leadingApp: 'Discord', leadingCategory: 'Social' },
    ]);
    expect(result.hourly[23].seconds).toBe(600);
    expect(result.hourly[0].seconds).toBe(600);
    expect(result.activeDays).toBe(2);
  });
});

describe('detectEras', () => {
  it('groups consecutive months led by the same app into an era', () => {
    const sessions = [
      session('1', 'Minecraft', 'gaming', '2025-01-05T10:00:00.000Z', 10_000),
      session('2', 'Minecraft', 'gaming', '2025-02-05T10:00:00.000Z', 12_000),
      session('3', 'Minecraft', 'gaming', '2025-03-05T10:00:00.000Z', 11_000),
      session('4', 'VS Code', 'coding', '2025-04-05T10:00:00.000Z', 13_000),
    ];

    expect(detectEras(sessions)).toEqual([
      expect.objectContaining({
        title: 'The Minecraft era',
        start: '2025-01',
        end: '2025-03',
        appId: 'minecraft',
      }),
    ]);
  });

  it('detects a short weekly mini era and records its peak boundary', () => {
    const sessions = [
      session('w1-code', 'VS Code', 'coding', '2026-08-03T10:00:00.000Z', 4_000),
      session('w1-web', 'Chrome', 'browsing', '2026-08-03T12:00:00.000Z', 2_000),
      session('w2-code', 'VS Code', 'coding', '2026-08-10T10:00:00.000Z', 8_000),
      session('w2-web', 'Chrome', 'browsing', '2026-08-10T13:00:00.000Z', 1_000),
    ];
    expect(detectEras(sessions)).toEqual([
      expect.objectContaining({ title: 'The VS Code mini era', kind: 'app', phase: expect.objectContaining({ peak: '2026-08-10' }) }),
    ]);
  });

  it('detects category eras when no single app dominates', () => {
    const sessions = [
      session('jan-code', 'VS Code', 'coding', '2025-01-05T10:00:00.000Z', 4_000),
      session('jan-terminal', 'Terminal', 'coding', '2025-01-06T10:00:00.000Z', 4_000),
      session('jan-web', 'Chrome', 'browsing', '2025-01-07T10:00:00.000Z', 3_000),
      session('feb-code', 'VS Code', 'coding', '2025-02-05T10:00:00.000Z', 4_000),
      session('feb-terminal', 'Terminal', 'coding', '2025-02-06T10:00:00.000Z', 4_000),
      session('feb-web', 'Chrome', 'browsing', '2025-02-07T10:00:00.000Z', 3_000),
      session('april', 'Spotify', 'music', '2025-04-01T10:00:00.000Z', 1_000),
    ];
    expect(detectEras(sessions)).toEqual([expect.objectContaining({ title: 'Your Coding stretch', kind: 'category' })]);
  });

  it('uses rolling share so one noisy middle month does not break a sustained era', () => {
    const sessions = [
      session('jan-code', 'VS Code', 'coding', '2025-01-05T10:00:00.000Z', 5_000),
      session('feb-browser', 'Chrome', 'browsing', '2025-02-05T10:00:00.000Z', 4_000),
      session('mar-code', 'VS Code', 'coding', '2025-03-05T10:00:00.000Z', 5_000),
      session('june-marker', 'Spotify', 'music', '2025-06-05T10:00:00.000Z', 100),
    ];

    expect(detectEras(sessions)).toEqual([expect.objectContaining({ title: 'The VS Code era', start: '2025-01', end: '2025-03' })]);
  });
});
