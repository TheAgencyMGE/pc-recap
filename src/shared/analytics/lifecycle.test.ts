import { describe, expect, it } from 'vitest';
import { detectLifecycleMoments } from './lifecycle';
import type { ActivitySession } from '../types';

const session = (id: string, startedAt: string): ActivitySession => ({
  id, appId: 'minecraft', appName: 'Minecraft', categoryId: 'gaming', startedAt,
  endedAt: new Date(new Date(startedAt).getTime() + 3_600_000).toISOString(), durationSeconds: 3_600,
});

describe('application lifecycle moments', () => {
  it('detects a comeback only after a meaningful absence', () => {
    const moments = detectLifecycleMoments([
      session('old', '2026-05-01T10:00:00.000Z'),
      session('return', '2026-07-01T10:00:00.000Z'),
    ], new Date('2026-07-02T10:00:00.000Z'));

    expect(moments).toContainEqual(expect.objectContaining({
      kind: 'comeback', appName: 'Minecraft', occurredAt: '2026-07-01T10:00:00.000Z', gapDays: 61,
    }));
  });
});
