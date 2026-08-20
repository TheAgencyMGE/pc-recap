import { execFile } from 'node:child_process';
import type { CommandRunner } from './types.js';

export const runPlatformCommand: CommandRunner = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, {
    encoding: 'utf8',
    timeout: 3_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  }, (error, stdout, stderr) => {
    if (error) {
      reject(new Error(stderr.trim() || error.message));
      return;
    }
    resolve({ stdout, stderr });
  });
});
