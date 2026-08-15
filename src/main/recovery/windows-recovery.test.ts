// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { decodeUserAssistName } from './user-assist';
import { prefetchExecutable } from './prefetch';
import { scanWindowsHistory } from './windows-recovery';

describe('Windows history recovery', () => {
  it('decodes ROT13 UserAssist executable names', () => {
    expect(decodeUserAssistName('P:\\Hfref\\Pbqr.rkr')).toBe('C:\\Users\\Code.exe');
    expect(prefetchExecutable('CHROME.EXE-89ABCDEF')).toBe('CHROME.EXE');
  });

  it('returns provenance-rich clues without duration fields', async () => {
    const result = await scanWindowsHistory({
      platform: 'win32',
      readers: [
        {
          id: 'userassist',
          label: 'Windows UserAssist',
          read: vi.fn().mockResolvedValue([{
            appName: 'Visual Studio Code', eventType: 'launched', occurredAt: '2026-07-01T12:00:00.000Z',
            sourceKind: 'windows_userassist', confidence: 'medium', detail: 'Windows recorded a launch.',
          }]),
        },
        {
          id: 'prefetch',
          label: 'Windows Prefetch',
          read: vi.fn().mockRejectedValue(new Error('Access denied')),
        },
      ],
    });

    expect(result.events[0]).toMatchObject({ eventType: 'launched', sourceKind: 'windows_userassist' });
    expect(result.events[0]).not.toHaveProperty('durationSeconds');
    expect(result.sources).toEqual([
      expect.objectContaining({ id: 'userassist', available: true, eventCount: 1 }),
      expect.objectContaining({ id: 'prefetch', available: false, eventCount: 0 }),
    ]);
    expect(result.warnings).toEqual([expect.stringMatching(/prefetch.*access denied/i)]);
  });

  it('does nothing on unsupported operating systems', async () => {
    const result = await scanWindowsHistory({ platform: 'linux' });
    expect(result.events).toEqual([]);
    expect(result.warnings[0]).toMatch(/only available on Windows/i);
  });

  it('reads browser history only after explicit consent', async () => {
    const read = vi.fn().mockResolvedValue([]);
    const browserReader = { id: 'browser-history', label: 'Browser history', read };

    await scanWindowsHistory({ platform: 'win32', readers: [], browserReader, includeBrowserHistory: false });
    expect(read).not.toHaveBeenCalled();

    await scanWindowsHistory({ platform: 'win32', readers: [], browserReader, includeBrowserHistory: true });
    expect(read).toHaveBeenCalledOnce();
  });
});
