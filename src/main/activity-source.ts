import { basename } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';

export interface ActiveWindowInfo {
  name: string;
  executable: string;
  path?: string;
  title?: string;
}

export interface ActivitySource {
  getActiveWindow(): Promise<ActiveWindowInfo | null>;
  dispose?(): void;
}

export class WindowsActivitySource implements ActivitySource {
  private child?: ChildProcessWithoutNullStreams;
  private lines?: Interface;
  private readonly pending: Array<{
    resolve: (value: ActiveWindowInfo | null) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

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
      this.child?.stdin.write("sample\n");
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
    const encoded = Buffer.from(WINDOWS_BRIDGE, 'utf16le').toString('base64');
    this.child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', (line) => {
      const request = this.pending.shift();
      if (!request) return;
      clearTimeout(request.timer);
      try {
        const result = JSON.parse(line.trim()) as ActiveWindowInfo & { error?: string };
        if (result.error) request.reject(new Error(result.error));
        else if (!result.name && !result.executable) request.resolve(null);
        else request.resolve({
          name: friendlyName(result.name || basename(result.path ?? '', '.exe')),
          executable: result.executable || basename(result.path ?? ''),
          path: result.path || undefined,
          title: result.title || undefined,
        });
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

const WINDOWS_BRIDGE = String.raw`
$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PCWrappedForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
  public static uint GetProcessId() { uint id; GetWindowThreadProcessId(GetForegroundWindow(), out id); return id; }
  public static string GetTitle() { var text = new StringBuilder(2048); GetWindowText(GetForegroundWindow(), text, text.Capacity); return text.ToString(); }
}
'@
Add-Type -TypeDefinition $source
while (($request = [Console]::In.ReadLine()) -ne $null) {
  if ($request -ne 'sample') { continue }
  try {
    $process = Get-Process -Id ([PCWrappedForeground]::GetProcessId()) -ErrorAction Stop
    $path = ''
    try { $path = $process.Path } catch {}
    $executable = if ($path) { [IO.Path]::GetFileName($path) } else { $process.ProcessName + '.exe' }
    [pscustomobject]@{ name = $process.ProcessName; executable = $executable; path = $path; title = [PCWrappedForeground]::GetTitle() } | ConvertTo-Json -Compress
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
