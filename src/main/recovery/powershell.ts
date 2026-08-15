import { execFile } from 'node:child_process';

export async function runFixedPowerShellJson<T>(script: string): Promise<T> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise<T>((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
    ], { windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(new Error(error.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim() || '[]') as T);
      } catch {
        reject(new Error('Windows returned unreadable recovery data.'));
      }
    });
  });
}
