import type { ActiveWindowInfo, ActivitySource } from '../activity-source.js';
import type { CommandRunner } from './types.js';

interface MacFrontmostApplication {
  name?: unknown;
  executable?: unknown;
  path?: unknown;
  bundleId?: unknown;
  pid?: unknown;
}

export class MacOSActivitySource implements ActivitySource {
  constructor(
    private readonly commandRunner: CommandRunner,
    private readonly captureWindowTitles: () => boolean = () => false,
  ) {}

  async getActiveWindow(): Promise<ActiveWindowInfo | null> {
    const result = await this.commandRunner('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_FRONTMOST_APPLICATION]);
    const parsed = parseMacFrontmostApplication(result.stdout);
    if (!parsed) return null;
    if (!this.captureWindowTitles()) return parsed;
    try {
      const titleResult = await this.commandRunner('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_WINDOW_TITLE]);
      const title = titleResult.stdout.trim();
      return title ? { ...parsed, title } : parsed;
    } catch {
      return parsed;
    }
  }
}

export function parseMacFrontmostApplication(value: string): ActiveWindowInfo | null {
  let parsed: MacFrontmostApplication;
  try {
    parsed = JSON.parse(value.trim()) as MacFrontmostApplication;
  } catch {
    throw new Error('macOS returned an unreadable foreground-application sample.');
  }
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  const executable = typeof parsed.executable === 'string' ? parsed.executable.trim() : '';
  if (!name && !executable) return null;
  return {
    name: name || executable,
    executable: executable || name,
    path: typeof parsed.path === 'string' && parsed.path.trim() ? parsed.path.trim() : undefined,
    bundleId: typeof parsed.bundleId === 'string' && parsed.bundleId.trim() ? parsed.bundleId.trim() : undefined,
    pid: typeof parsed.pid === 'number' && Number.isSafeInteger(parsed.pid) && parsed.pid > 0 ? parsed.pid : undefined,
  };
}

const MAC_FRONTMOST_APPLICATION = String.raw`
ObjC.import('AppKit');
const app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
if (!app) {
  JSON.stringify({});
} else {
  JSON.stringify({
    name: ObjC.unwrap(app.localizedName) || '',
    executable: ObjC.unwrap(app.executableURL.lastPathComponent) || '',
    path: ObjC.unwrap(app.bundleURL.path) || '',
    bundleId: ObjC.unwrap(app.bundleIdentifier) || '',
    pid: Number(app.processIdentifier),
  });
}
`;

const MAC_WINDOW_TITLE = String.raw`
const systemEvents = Application('System Events');
const front = systemEvents.applicationProcesses.whose({frontmost: true})[0];
const windows = front ? front.windows() : [];
windows.length ? String(windows[0].name()) : '';
`;
