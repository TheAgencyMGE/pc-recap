import { describe, expect, it, vi } from 'vitest';

describe('renderer API bridge', () => {
  it('rejects requests when the renderer is opened outside Electron', async () => {
    delete window.pcWrapped;
    vi.resetModules();

    const { rendererApi } = await import('./api');

    await expect(rendererApi.getDashboard()).rejects.toThrow(/electron desktop app/i);
  });
});
