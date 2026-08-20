import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface NativeLoginItemSettings {
  openAtLogin: boolean;
  args: string[];
}

interface LaunchAtStartupOptions {
  platform: NodeJS.Platform;
  enabled: boolean;
  isPackaged: boolean;
  executablePath: string;
  configHome?: string;
  setNativeLoginItemSettings?: (settings: NativeLoginItemSettings) => void;
}

export type LaunchAtStartupResult = {
  configured: boolean;
  method: 'native' | 'desktop-entry' | 'development' | 'unsupported';
};

const linuxExecutable = (path: string) => JSON.stringify(path.replaceAll('%', '%%').replace(/[\r\n]/g, ''));

export async function configureLaunchAtStartup({
  platform,
  enabled,
  isPackaged,
  executablePath,
  configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
  setNativeLoginItemSettings,
}: LaunchAtStartupOptions): Promise<LaunchAtStartupResult> {
  if (!isPackaged) return { configured: false, method: 'development' };

  if (platform === 'win32' || platform === 'darwin') {
    if (!setNativeLoginItemSettings) throw new Error('Native login-item support is unavailable.');
    setNativeLoginItemSettings({ openAtLogin: enabled, args: enabled ? ['--hidden'] : [] });
    return { configured: true, method: 'native' };
  }

  if (platform === 'linux') {
    const autostartDirectory = join(configHome, 'autostart');
    const desktopPath = join(autostartDirectory, 'pc-recap.desktop');
    if (!enabled) {
      await rm(desktopPath, { force: true });
      return { configured: true, method: 'desktop-entry' };
    }

    await mkdir(autostartDirectory, { recursive: true });
    await writeFile(desktopPath, [
      '[Desktop Entry]',
      'Type=Application',
      'Version=1.0',
      'Name=PC Recap',
      'Comment=Keep PC Recap collecting in the background',
      `Exec=${linuxExecutable(executablePath)} --hidden`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n'), { encoding: 'utf8', mode: 0o600 });
    return { configured: true, method: 'desktop-entry' };
  }

  return { configured: false, method: 'unsupported' };
}
