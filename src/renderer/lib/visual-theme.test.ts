import { describe, expect, it } from 'vitest';
import { buildTapeBands, themeForPeriod } from './visual-theme';

describe('visual mixtape theme', () => {
  it('keeps a period art direction stable across reloads', () => {
    const first = themeForPeriod('month', 'August 2026');
    const second = themeForPeriod('month', 'August 2026');

    expect(first).toEqual(second);
    expect(first.background).toMatch(/^#[0-9A-F]{6}$/);
    expect(first.foreground).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('does not decorate an empty period with invented tape bands', () => {
    expect(buildTapeBands([
      { label: '00', seconds: 0 },
      { label: '01', seconds: 0 },
    ], ['#FA4B3D'])).toEqual([]);
  });

  it('turns real activity into hand-checked proportional bands', () => {
    expect(buildTapeBands([
      { label: '09', seconds: 30 },
      { label: '10', seconds: 90 },
    ], ['#FA4B3D', '#9189FF'])).toEqual([
      { label: '09', seconds: 30, share: 25, color: '#FA4B3D' },
      { label: '10', seconds: 90, share: 75, color: '#9189FF' },
    ]);
  });

  it('ignores zero buckets without changing real-bucket proportions', () => {
    expect(buildTapeBands([
      { label: '09', seconds: 40 },
      { label: '10', seconds: 0 },
      { label: '11', seconds: 60 },
    ], ['#E7BE00', '#355CFF'])).toEqual([
      { label: '09', seconds: 40, share: 40, color: '#E7BE00' },
      { label: '11', seconds: 60, share: 60, color: '#355CFF' },
    ]);
  });
});
