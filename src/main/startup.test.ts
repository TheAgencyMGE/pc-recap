// @vitest-environment node
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureLaunchAtStartup } from './startup';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('configureLaunchAtStartup', () => {
  it.each(['win32', 'darwin'] as const)('uses Electron login items on %s', async (platform) => {
    const setNativeLoginItemSettings = vi.fn();

    const result = await configureLaunchAtStartup({
      platform,
      enabled: true,
      isPackaged: true,
      executablePath: '/Applications/PC Recap',
      setNativeLoginItemSettings,
    });

    expect(setNativeLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, args: ['--hidden'] });
    expect(result).toEqual({ configured: true, method: 'native' });
  });

  it('creates and removes a Linux autostart desktop entry without invoking a shell', async () => {
    const configHome = await mkdtemp(join(tmpdir(), 'pc-recap-autostart-'));
    temporaryDirectories.push(configHome);
    const desktopPath = join(configHome, 'autostart', 'pc-recap.desktop');

    await configureLaunchAtStartup({
      platform: 'linux',
      enabled: true,
      isPackaged: true,
      executablePath: '/opt/PC Recap/pc-recap',
      configHome,
    });

    expect(await readFile(desktopPath, 'utf8')).toContain('Exec="/opt/PC Recap/pc-recap" --hidden');
    await configureLaunchAtStartup({
      platform: 'linux',
      enabled: false,
      isPackaged: true,
      executablePath: '/opt/PC Recap/pc-recap',
      configHome,
    });
    await expect(stat(desktopPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not register the Electron development binary as a login item', async () => {
    const setNativeLoginItemSettings = vi.fn();

    const result = await configureLaunchAtStartup({
      platform: 'win32',
      enabled: true,
      isPackaged: false,
      executablePath: 'electron.exe',
      setNativeLoginItemSettings,
    });

    expect(setNativeLoginItemSettings).not.toHaveBeenCalled();
    expect(result).toEqual({ configured: false, method: 'development' });
  });
});
