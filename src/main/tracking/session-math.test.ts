// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { idleEndTime, transitionMidpoint } from './session-math';

describe('tracking session math', () => {
  it('ends activity when the user became idle instead of at the later sample', () => {
    expect(idleEndTime(
      new Date('2026-08-15T10:05:10.000Z'),
      310,
      new Date('2026-08-15T09:00:00.000Z'),
    ).toISOString()).toBe('2026-08-15T10:00:00.000Z');
  });

  it('uses the midpoint between samples for an application transition', () => {
    expect(transitionMidpoint(
      new Date('2026-08-15T10:00:00.000Z'),
      new Date('2026-08-15T10:00:10.000Z'),
    ).toISOString()).toBe('2026-08-15T10:00:05.000Z');
  });

  it('never ends a session before it started', () => {
    expect(idleEndTime(
      new Date('2026-08-15T10:05:10.000Z'),
      900,
      new Date('2026-08-15T10:00:00.000Z'),
    ).toISOString()).toBe('2026-08-15T10:00:00.000Z');
  });
});
