import { basename } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { chooseHostedApplication } from './tracking/app-identity.js';
import { LinuxX11ActivitySource } from './platform/linux-activity-source.js';
import { MacOSActivitySource } from './platform/macos-activity-source.js';
import { runPlatformCommand } from './platform/command.js';
import type { ActivitySourceSelection, CommandRunner } from './platform/types.js';

export interface ActiveWindowInfo {
  name: string;
  executable: string;
  path?: string;
  title?: string;
  pid?: number;
  bundleId?: string;
}

export interface ActivitySource {
  getActiveWindow(): Promise<ActiveWindowInfo | null>;
  dispose?(): void;
}

export function createPlatformActivitySource(
  options: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    captureWindowTitles?: () => boolean;
    commandRunner?: CommandRunner;
  } = {},
): ActivitySourceSelection {
  const platform = options.platform ?? process.platform;
  const captureWindowTitles = options.captureWindowTitles ?? (() => false);
  const commandRunner = options.commandRunner ?? runPlatformCommand;
  if (platform === 'win32') {
    return {
      id: 'windows-foreground',
      available: true,
      source: new WindowsActivitySource(captureWindowTitles),
      capabilities: {
        platform,
        collector: 'windows-foreground',
        available: true,
        sessionType: 'windows',
        windowTitles: 'available',
      },
    };
  }
  if (platform === 'darwin') {
    return {
      id: 'macos-workspace',
      available: true,
      source: new MacOSActivitySource(commandRunner, captureWindowTitles),
      capabilities: {
        platform,
        collector: 'macos-workspace',
        available: true,
        sessionType: 'aqua',
        windowTitles: 'permission-required',
      },
    };
  }
  if (platform === 'linux') {
    const env = options.env ?? process.env;
    const sessionType = env.XDG_SESSION_TYPE?.trim().toLowerCase()
      || (env.WAYLAND_DISPLAY ? 'wayland' : env.DISPLAY ? 'x11' : 'unknown');
    if (sessionType === 'x11' && env.DISPLAY) {
      return {
        id: 'linux-x11',
        available: true,
        source: new LinuxX11ActivitySource(commandRunner, captureWindowTitles),
        capabilities: {
          platform,
          collector: 'linux-x11',
          available: true,
          sessionType: 'x11',
          windowTitles: 'available',
        },
      };
    }
    if (sessionType === 'wayland') {
      const reason = 'Foreground application tracking is unavailable in this Wayland session.';
      return {
        id: 'linux-wayland-unavailable',
        available: false,
        reason,
        source: new UnavailableActivitySource(),
        capabilities: {
          platform,
          collector: 'linux-wayland-unavailable',
          available: false,
          sessionType: 'wayland',
          windowTitles: 'unavailable',
        },
      };
    }
  }
  const reason = `Foreground application tracking is unavailable on ${platform}.`;
  return {
    id: 'unavailable',
    available: false,
    reason,
    source: new UnavailableActivitySource(),
    capabilities: {
      platform,
      collector: 'unavailable',
      available: false,
      sessionType: 'unknown',
      windowTitles: 'unavailable',
    },
  };
}

class UnavailableActivitySource implements ActivitySource {
  async getActiveWindow() { return null; }
}

export class WindowsActivitySource implements ActivitySource {
  private child?: ChildProcessWithoutNullStreams;
  private lines?: Interface;
  private readonly pending: Array<{
    resolve: (value: ActiveWindowInfo | null) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(private readonly captureWindowTitles: () => boolean = () => false) {}

  async getActiveWindow(): Promise<ActiveWindowInfo | null> {
    if (process.platform !== 'win32') return null;
    this.ensureBridge();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.pending.findIndex((item) => item.timer === timer);
        if (index >= 0) this.pending.splice(index, 1);
        reject(new Error('Windows did not return the foreground application in time.'));
      }, 3_000);
      this.pending.push({ resolve, reject, timer });
      this.child?.stdin.write(this.captureWindowTitles() ? "sample-title\n" : "sample\n");
    });
  }

  dispose() {
    this.lines?.close();
    this.child?.kill();
    this.lines = undefined;
    this.child = undefined;
    this.rejectPending(new Error('The Windows activity bridge stopped.'));
  }

  private ensureBridge() {
    if (this.child && !this.child.killed) return;
    const encoded = Buffer.from(WINDOWS_ACTIVITY_BRIDGE, 'utf16le').toString('base64');
    this.child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', (line) => {
      const request = this.pending.shift();
      if (!request) return;
      clearTimeout(request.timer);
      try {
        const result = JSON.parse(line.trim()) as ActiveWindowInfo & { error?: string; children?: ActiveWindowInfo[] };
        if (result.error) request.reject(new Error(result.error));
        else if (!result.name && !result.executable) request.resolve(null);
        else request.resolve(chooseHostedApplication({
          name: friendlyName(result.name || basename(result.path ?? '', '.exe')),
          executable: result.executable || basename(result.path ?? ''),
          path: result.path || undefined,
          title: result.title || undefined,
        }, (result.children ?? []).map((child) => ({
          ...child,
          name: friendlyName(child.name || basename(child.path ?? '', '.exe')),
        }))));
      } catch {
        request.reject(new Error('Windows returned an unreadable activity sample.'));
      }
    });
    const stopped = () => {
      this.lines?.close();
      this.child = undefined;
      this.lines = undefined;
      this.rejectPending(new Error('The Windows activity bridge exited unexpectedly.'));
    };
    this.child.once('error', stopped);
    this.child.once('exit', stopped);
  }

  private rejectPending(error: Error) {
    for (const request of this.pending.splice(0)) {
      clearTimeout(request.timer);
      request.reject(error);
    }
  }
}

const friendlyName = (name: string) => ({
  Code: 'Visual Studio Code', chrome: 'Chrome', msedge: 'Microsoft Edge', Discord: 'Discord',
  Spotify: 'Spotify', WindowsTerminal: 'Windows Terminal', explorer: 'File Explorer',
}[name] ?? name);

export const WINDOWS_ACTIVITY_BRIDGE = String.raw`
$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PCRecapForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
  public static uint GetProcessId() { uint id; GetWindowThreadProcessId(GetForegroundWindow(), out id); return id; }
  public static string GetTitle() { var text = new StringBuilder(2048); GetWindowText(GetForegroundWindow(), text, text.Capacity); return text.ToString(); }
}
'@
Add-Type -TypeDefinition $source
while (($request = [Console]::In.ReadLine()) -ne $null) {
  if ($request -ne 'sample' -and $request -ne 'sample-title') { continue }
  try {
    $process = Get-Process -Id ([PCRecapForeground]::GetProcessId()) -ErrorAction Stop
    $path = ''
    try { $path = $process.Path } catch {}
    $executable = if ($path) { [IO.Path]::GetFileName($path) } else { $process.ProcessName + '.exe' }
    $children = @()
    if ($process.ProcessName -eq 'ApplicationFrameHost') {
      try {
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($process.Id)" -ErrorAction Stop | ForEach-Object {
          $childPath = $_.ExecutablePath
          [pscustomobject]@{ name = $_.Name -replace '\.exe$',''; executable = $_.Name; path = $childPath }
        })
      } catch {}
    }
    $title = if ($request -eq 'sample-title') { [PCRecapForeground]::GetTitle() } else { '' }
    [pscustomobject]@{ name = $process.ProcessName; executable = $executable; path = $path; title = $title; pid = $process.Id; children = $children } | ConvertTo-Json -Compress -Depth 3
  } catch {
    [pscustomobject]@{ error = $_.Exception.Message } | ConvertTo-Json -Compress
  }
  [Console]::Out.Flush()
}
`;

export function categoryForApplication(info: Pick<ActiveWindowInfo, 'name' | 'executable'>): string {
  const value = `${info.name} ${info.executable}`.toLowerCase();
  const rules: Array<[string, string[]]> = [
    ['coding', ['code.exe', 'visual studio', 'webstorm', 'rider', 'idea64', 'pycharm', 'terminal', 'powershell', 'cmd.exe', 'gitkraken']],
    ['gaming', ['minecraft', 'steam', 'epicgames', 'battle.net', 'riotclient', 'roblox', 'xbox']],
    ['browsing', ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'arc']],
    ['social', ['discord', 'slack', 'teams', 'telegram', 'whatsapp', 'signal']],
    ['music', ['spotify', 'musicbee', 'foobar', 'itunes', 'tidal']],
    ['creative', ['blender', 'photoshop', 'illustrator', 'figma', 'premiere', 'afterfx', 'davinci']],
    ['work', ['obsidian', 'notion', 'winword', 'excel', 'powerpnt', 'onenote']],
  ];
  return rules.find(([, needles]) => needles.some((needle) => value.includes(needle)))?.[0] ?? 'other';
}
