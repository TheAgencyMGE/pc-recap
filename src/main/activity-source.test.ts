import { describe, expect, it } from 'vitest';
import * as activitySourceModule from './activity-source.js';

type Selection = {
  id: string;
  available: boolean;
  reason?: string;
  source: { getActiveWindow(): Promise<unknown> };
  capabilities?: {
    sessionType?: string;
    windowTitles?: 'available' | 'permission-required' | 'unavailable';
  };
};

type CreatePlatformActivitySource = (options: {
  platform: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  captureWindowTitles?: () => boolean;
  commandRunner?: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
}) => Selection;

const factory = () => (activitySourceModule as unknown as {
  createPlatformActivitySource?: CreatePlatformActivitySource;
}).createPlatformActivitySource;

describe('platform activity-source selection', () => {
  it('allows both privacy-preserving and title-enabled requests through the Windows bridge', () => {
    const bridge = (activitySourceModule as unknown as { WINDOWS_ACTIVITY_BRIDGE?: string }).WINDOWS_ACTIVITY_BRIDGE;

    expect(bridge).toContain("$request -ne 'sample' -and $request -ne 'sample-title'");
  });

  it('selects the Windows collector through the shared platform boundary', () => {
    const createPlatformActivitySource = factory();

    expect(createPlatformActivitySource).toBeTypeOf('function');
    expect(createPlatformActivitySource?.({ platform: 'win32' })).toMatchObject({
      id: 'windows-foreground',
      available: true,
    });
  });

  it('reads the frontmost macOS application without requesting a window-title permission', async () => {
    const createPlatformActivitySource = factory();
    const commands: Array<{ file: string; args: string[] }> = [];
    const selection = createPlatformActivitySource?.({
      platform: 'darwin',
      captureWindowTitles: () => false,
      commandRunner: async (file, args) => {
        commands.push({ file, args });
        return {
          stdout: JSON.stringify({
            name: 'Google Chrome',
            executable: 'Google Chrome',
            path: '/Applications/Google Chrome.app',
            bundleId: 'com.google.Chrome',
            pid: 421,
          }),
          stderr: '',
        };
      },
    });

    expect(selection).toMatchObject({
      id: 'macos-workspace',
      available: true,
      capabilities: { windowTitles: 'permission-required' },
    });
    await expect(selection?.source.getActiveWindow()).resolves.toMatchObject({
      name: 'Google Chrome',
      executable: 'Google Chrome',
      bundleId: 'com.google.Chrome',
      pid: 421,
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]?.file).toContain('osascript');
    expect(commands[0]?.args.join(' ')).not.toContain('System Events');
  });

  it('reads the active X11 window and reports the actual session capability', async () => {
    const createPlatformActivitySource = factory();
    const selection = createPlatformActivitySource?.({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' },
      captureWindowTitles: () => true,
      commandRunner: async (_file, args) => args.includes('-root')
        ? { stdout: '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x4600007\n', stderr: '' }
        : {
          stdout: [
            '_NET_WM_PID(CARDINAL) = 4242',
            'WM_CLASS(STRING) = "code", "Code"',
            '_NET_WM_NAME(UTF8_STRING) = "PC Recap 1.2"',
          ].join('\n'),
          stderr: '',
        },
    });

    expect(selection).toMatchObject({
      id: 'linux-x11',
      available: true,
      capabilities: { sessionType: 'x11', windowTitles: 'available' },
    });
    await expect(selection?.source.getActiveWindow()).resolves.toMatchObject({
      name: 'Code',
      executable: 'code',
      title: 'PC Recap 1.2',
      pid: 4242,
    });
  });

  it('does not request an X11 window title while title capture is disabled', async () => {
    const createPlatformActivitySource = factory();
    const calls: string[][] = [];
    const selection = createPlatformActivitySource?.({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' },
      captureWindowTitles: () => false,
      commandRunner: async (_file, args) => {
        calls.push(args);
        return args.includes('-root')
          ? { stdout: '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x4600007\n', stderr: '' }
          : { stdout: '_NET_WM_PID(CARDINAL) = 4242\nWM_CLASS(STRING) = "code", "Code"', stderr: '' };
      },
    });

    await selection?.source.getActiveWindow();

    expect(calls[1]).not.toContain('_NET_WM_NAME');
  });

  it('reports Wayland as unavailable instead of generating fake foreground activity', async () => {
    const createPlatformActivitySource = factory();
    let commandCount = 0;
    const selection = createPlatformActivitySource?.({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' },
      commandRunner: async () => {
        commandCount += 1;
        return { stdout: '', stderr: '' };
      },
    });

    expect(selection).toMatchObject({
      id: 'linux-wayland-unavailable',
      available: false,
      capabilities: { sessionType: 'wayland', windowTitles: 'unavailable' },
    });
    expect(selection?.reason).toContain('Wayland');
    await expect(selection?.source.getActiveWindow()).resolves.toBeNull();
    expect(commandCount).toBe(0);
  });
});
