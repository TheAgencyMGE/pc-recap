// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const registeredHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    setLoginItemSettings: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => registeredHandlers.set(channel, handler),
  },
}));

import { registerIpcHandlers } from './ipc';

describe('IPC authorization', () => {
  beforeEach(() => registeredHandlers.clear());

  it('rejects a privileged request from any frame other than the app main frame', async () => {
    const deleteAllHistory = vi.fn();
    const mainFrame = { url: 'file:///C:/Program%20Files/PC%20Recap/resources/app.asar/dist/renderer/index.html' };
    const webContents = { mainFrame };
    const dependencies = {
      repository: { deleteAllHistory } as never,
      analytics: {} as never,
      tracker: {} as never,
      backup: {} as never,
      icons: {} as never,
      history: {} as never,
      getMainWindow: () => ({ webContents }),
      trustedRendererUrl: mainFrame.url,
    };
    registerIpcHandlers(dependencies);
    const handler = registeredHandlers.get('history:delete-all');

    expect(() => handler?.({ sender: webContents, senderFrame: { url: 'https://malicious.example/' } }))
      .toThrow(/unauthorized/i);
    expect(deleteAllHistory).not.toHaveBeenCalled();
  });
});
