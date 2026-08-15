import Database from 'better-sqlite3';
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { RecoveredEventInput } from '../../shared/types.js';
import { normalizeApplication } from '../tracking/app-identity.js';

export async function readWindowsActivityHistoryEvents(): Promise<RecoveredEventInput[]> {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return [];
  const root = join(localAppData, 'ConnectedDevicesPlatform');
  if (!existsSync(root)) return [];
  const databases = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, 'ActivitiesCache.db'))
    .filter(existsSync)
    .slice(0, 20);
  const events: RecoveredEventInput[] = [];
  for (const path of databases) events.push(...readActivityDatabase(path));
  return events.slice(0, 100_000);
}

function readActivityDatabase(path: string): RecoveredEventInput[] {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const table = database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND LOWER(name) = 'activity'`).get() as { name: string } | undefined;
    if (!table) return [];
    const columns = new Set((database.prepare(`PRAGMA table_info("${table.name.replaceAll('"', '""')}")`).all() as Array<{ name: string }>).map((item) => item.name));
    const appColumn = ['AppId', 'ApplicationId', 'PackageId'].find((name) => columns.has(name));
    const timeColumn = ['LastModifiedTime', 'EndTime', 'StartTime'].find((name) => columns.has(name));
    if (!appColumn || !timeColumn) return [];
    const safeTable = table.name.replaceAll('"', '""');
    const rows = database.prepare(`SELECT "${appColumn}" AS app, "${timeColumn}" AS occurred FROM "${safeTable}" LIMIT 100001`).all() as Array<{ app: unknown; occurred: unknown }>;
    if (rows.length > 100_000) throw new Error('Windows Activity History contains too many rows.');
    return rows.flatMap((row) => {
      const occurredAt = windowsTimeToIso(row.occurred);
      const executable = activityAppName(row.app);
      if (!occurredAt || !executable) return [];
      const normalized = normalizeApplication({ name: executable.replace(/\.exe$/i, ''), executable });
      return [{
        appName: normalized.canonicalName,
        appId: normalized.canonicalId,
        eventType: 'recently-used' as const,
        occurredAt,
        sourceKind: 'windows_activity_history',
        confidence: 'low' as const,
        detail: 'Legacy Windows Activity History referenced this app. It does not provide verified foreground duration.',
      }];
    });
  } finally {
    database.close();
  }
}

function activityAppName(value: unknown): string | undefined {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? '');
  const executable = text.match(/[A-Za-z0-9_. -]+\.exe/i)?.[0];
  if (executable) return basename(executable);
  const application = text.match(/"application"\s*:\s*"([^"]+)"/i)?.[1];
  return application ? basename(application) : undefined;
}

function windowsTimeToIso(value: unknown): string | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const parsed = Date.parse(String(value ?? ''));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }
  const milliseconds = number > 10_000_000_000_000
    ? number / 10_000 - 11_644_473_600_000
    : number > 10_000_000_000 ? number : number * 1_000;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
}
