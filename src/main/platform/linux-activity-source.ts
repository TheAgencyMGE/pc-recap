import { readlink } from 'node:fs/promises';
import type { ActiveWindowInfo, ActivitySource } from '../activity-source.js';
import type { CommandRunner } from './types.js';

export class LinuxX11ActivitySource implements ActivitySource {
  constructor(
    private readonly commandRunner: CommandRunner,
    private readonly captureWindowTitles: () => boolean = () => false,
  ) {}

  async getActiveWindow(): Promise<ActiveWindowInfo | null> {
    const root = await this.commandRunner('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
    const id = /(?:#|=)\s*(0x[0-9a-f]+)/i.exec(root.stdout)?.[1];
    if (!id || id === '0x0') return null;
    const includeTitle = this.captureWindowTitles();
    const properties = await this.commandRunner('xprop', [
      '-id', id, '_NET_WM_PID', 'WM_CLASS', ...(includeTitle ? ['_NET_WM_NAME'] : []),
    ]);
    const parsed = parseLinuxActiveWindow(properties.stdout, includeTitle);
    if (!parsed?.pid) return parsed;
    try {
      return { ...parsed, path: await readlink(`/proc/${parsed.pid}/exe`) };
    } catch {
      return parsed;
    }
  }
}

export function parseLinuxActiveWindow(value: string, includeTitle: boolean): ActiveWindowInfo | null {
  const pidValue = /_NET_WM_PID\([^)]*\)\s*=\s*(\d+)/i.exec(value)?.[1];
  const classValue = /WM_CLASS\([^)]*\)\s*=\s*"([^"]*)"\s*,\s*"([^"]*)"/i.exec(value);
  const titleValue = /_NET_WM_NAME\([^)]*\)\s*=\s*"([^"]*)"/i.exec(value)?.[1];
  const executable = classValue?.[1]?.trim() ?? '';
  const name = classValue?.[2]?.trim() ?? executable;
  if (!name && !executable) return null;
  return {
    name,
    executable,
    pid: pidValue ? Number(pidValue) : undefined,
    title: includeTitle && titleValue?.trim() ? titleValue.trim() : undefined,
  };
}
