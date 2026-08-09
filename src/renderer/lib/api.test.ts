import { describe, expect, it, vi } from 'vitest';

describe('renderer API bridge', () => {
  it('uses the PC Recap preload bridge inside Electron', async () => {
    const bridge = { getDashboard: vi.fn() };
    (window as unknown as { pcRecap?: typeof bridge }).pcRecap = bridge;
    vi.resetModules();

    const { rendererApi } = await import('./api');

    expect(rendererApi).toBe(bridge);
  });

  it('rejects requests when the renderer is opened outside Electron', async () => {
    delete window.pcRecap;
    vi.resetModules();

    const { rendererApi } = await import('./api');

    await expect(rendererApi.getDashboard()).rejects.toThrow(/electron desktop app/i);
  });
});
