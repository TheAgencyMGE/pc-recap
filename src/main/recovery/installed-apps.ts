import { basename } from 'node:path';
import type { RecoveredEventInput } from '../../shared/types.js';
import { normalizeApplication } from '../tracking/app-identity.js';
import { runFixedPowerShellJson } from './powershell.js';

interface InstalledAppRow { name?: string; installDate?: string; icon?: string; location?: string }

export async function readInstalledAppEvents(): Promise<RecoveredEventInput[]> {
  const rows = await runFixedPowerShellJson<InstalledAppRow[]>(INSTALLED_APPS_SCRIPT);
  return rows.slice(0, 50_000).flatMap((row) => {
    const occurredAt = parseInstallDate(row.installDate);
    if (!row.name?.trim() || !occurredAt) return [];
    const executable = executableFrom(row) || `${row.name}.exe`;
    const normalized = normalizeApplication({ name: row.name.trim(), executable, path: row.location });
    return [{
      appName: normalized.canonicalName,
      appId: normalized.canonicalId,
      eventType: 'installed' as const,
      occurredAt,
      sourceKind: 'windows_installed_apps',
      confidence: 'medium' as const,
      detail: 'Windows reported this installation date. Install dates can reflect an update or reinstall.',
    }];
  });
}

function parseInstallDate(value?: string): string | undefined {
  if (!value) return undefined;
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  const timestamp = Date.parse(compact ? `${compact[1]}-${compact[2]}-${compact[3]}T12:00:00` : value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function executableFrom(row: InstalledAppRow) {
  const candidate = row.icon?.split(',')[0]?.replace(/^"|"$/g, '') || row.location || '';
  const name = basename(candidate);
  return name.toLowerCase().endsWith('.exe') ? name : '';
}

const INSTALLED_APPS_SCRIPT = String.raw`
$paths = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$results = foreach ($path in $paths) {
  Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.InstallDate } | ForEach-Object {
    [pscustomobject]@{ name = $_.DisplayName; installDate = $_.InstallDate; icon = $_.DisplayIcon; location = $_.InstallLocation }
  }
}
@($results) | Sort-Object name,installDate -Unique | ConvertTo-Json -Compress -Depth 3
`;
