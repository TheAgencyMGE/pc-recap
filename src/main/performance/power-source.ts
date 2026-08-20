import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandRunner } from '../platform/types.js';
import { runPlatformCommand } from '../platform/command.js';
import type { PowerSnapshot } from './system-sampler.js';

interface PowerReaderOptions {
  platform?: NodeJS.Platform;
  commandRunner?: CommandRunner;
  now?: () => number;
  linuxPowerRoot?: string;
}

export function createPlatformPowerReader(options: PowerReaderOptions = {}) {
  const platform = options.platform ?? process.platform;
  const commandRunner = options.commandRunner ?? runPlatformCommand;
  const now = options.now ?? Date.now;
  let cached: { expiresAt: number; value: PowerSnapshot } | undefined;
  return async (): Promise<PowerSnapshot> => {
    if (cached && cached.expiresAt > now()) return cached.value;
    let value: PowerSnapshot = {};
    try {
      if (platform === 'win32') {
        const result = await commandRunner('powershell.exe', [
          '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-EncodedCommand', Buffer.from(WINDOWS_POWER_SCRIPT, 'utf16le').toString('base64'),
        ]);
        value = parseWindowsPowerStatus(result.stdout);
      } else if (platform === 'darwin') {
        value = parseMacPowerStatus((await commandRunner('/usr/bin/pmset', ['-g', 'batt'])).stdout);
      } else if (platform === 'linux') {
        value = await readLinuxPowerStatus(options.linuxPowerRoot ?? '/sys/class/power_supply');
      }
    } catch {
      value = {};
    }
    cached = { expiresAt: now() + 60_000, value };
    return value;
  };
}

export function parseWindowsPowerStatus(value: string): PowerSnapshot {
  let parsed: { acLineStatus?: unknown; batteryFlag?: unknown; batteryPercent?: unknown };
  try { parsed = JSON.parse(value.trim()) as typeof parsed; } catch { return {}; }
  const ac = finiteNumber(parsed.acLineStatus);
  const flag = finiteNumber(parsed.batteryFlag);
  const percent = validBatteryPercent(parsed.batteryPercent);
  const batteryAbsent = flag === 128 || percent === undefined;
  const powerState: PowerSnapshot['powerState'] = flag === 8
    ? 'charging'
    : ac === 1 ? 'ac'
      : ac === 0 && !batteryAbsent ? 'battery' : undefined;
  return compact({ batteryPercent: batteryAbsent ? undefined : percent, powerState });
}

export function parseMacPowerStatus(value: string): PowerSnapshot {
  const percent = validBatteryPercent(/(\d{1,3})%/.exec(value)?.[1]);
  const lower = value.toLowerCase();
  const powerState: PowerSnapshot['powerState'] = lower.includes('discharging') || lower.includes("'battery power'")
    ? 'battery'
    : lower.includes('charging') || lower.includes('charged')
      ? 'charging'
      : lower.includes("'ac power'") ? 'ac' : undefined;
  return compact({ batteryPercent: percent, powerState });
}

export function parseLinuxPowerStatus(value: { capacity?: string; status?: string }): PowerSnapshot {
  const batteryPercent = validBatteryPercent(value.capacity);
  const status = value.status?.trim().toLowerCase();
  const powerState: PowerSnapshot['powerState'] = status === 'charging'
    ? 'charging'
    : status === 'discharging' ? 'battery'
      : status === 'full' || status === 'not charging' ? 'ac' : undefined;
  return compact({ batteryPercent, powerState });
}

async function readLinuxPowerStatus(root: string): Promise<PowerSnapshot> {
  const entries = await readdir(root, { withFileTypes: true });
  const battery = entries.find((entry) => entry.isDirectory() && /^BAT/i.test(entry.name));
  if (!battery) return {};
  const directory = join(root, battery.name);
  const [capacity, status] = await Promise.all([
    readFile(join(directory, 'capacity'), 'utf8').catch(() => ''),
    readFile(join(directory, 'status'), 'utf8').catch(() => ''),
  ]);
  return parseLinuxPowerStatus({ capacity, status });
}

function validBatteryPercent(value: unknown) {
  const parsed = typeof value === 'string' && value.trim() ? Number(value.trim()) : finiteNumber(value);
  return parsed !== undefined && parsed >= 0 && parsed <= 100 ? Math.round(parsed) : undefined;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

const WINDOWS_POWER_SCRIPT = String.raw`
$source = @'
using System;
using System.Runtime.InteropServices;
public static class PCRecapPower {
  [StructLayout(LayoutKind.Sequential)] public struct Status {
    public byte ACLineStatus; public byte BatteryFlag; public byte BatteryLifePercent; public byte SystemStatusFlag;
    public int BatteryLifeTime; public int BatteryFullLifeTime;
  }
  [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out Status value);
  public static Status Read() { Status value; GetSystemPowerStatus(out value); return value; }
}
'@
Add-Type -TypeDefinition $source
$status = [PCRecapPower]::Read()
[pscustomobject]@{ acLineStatus = $status.ACLineStatus; batteryFlag = $status.BatteryFlag; batteryPercent = $status.BatteryLifePercent } | ConvertTo-Json -Compress
`;
