import { basename } from 'node:path';
import type { RecoveredEventInput } from '../../shared/types.js';
import { normalizeApplication } from '../tracking/app-identity.js';
import { runFixedPowerShellJson } from './powershell.js';

interface UserAssistRow { encodedName?: string; lastRunAt?: string; runCount?: number }

export function decodeUserAssistName(value: string): string {
  return value.replace(/[A-Za-z]/g, (character) => {
    const code = character.charCodeAt(0);
    const start = code <= 90 ? 65 : 97;
    return String.fromCharCode(start + ((code - start + 13) % 26));
  });
}

export async function readUserAssistEvents(): Promise<RecoveredEventInput[]> {
  const rows = await runFixedPowerShellJson<UserAssistRow[]>(USER_ASSIST_SCRIPT);
  return rows.slice(0, 50_000).flatMap((row) => {
    if (!row.encodedName || !row.lastRunAt || !Number.isFinite(Date.parse(row.lastRunAt))) return [];
    const decoded = decodeUserAssistName(row.encodedName).replace(/^\{[^}]+\}\\/i, '');
    const executable = basename(decoded);
    if (!executable || executable.startsWith('{')) return [];
    const normalized = normalizeApplication({ name: executable.replace(/\.exe$/i, ''), executable, path: decoded });
    return [{
      appName: normalized.canonicalName,
      appId: normalized.canonicalId,
      eventType: 'launched' as const,
      occurredAt: new Date(row.lastRunAt).toISOString(),
      sourceKind: 'windows_userassist',
      confidence: 'medium' as const,
      detail: `Windows UserAssist recorded a launch${row.runCount ? ` and a run count of ${row.runCount}` : ''}. It does not reveal usage duration.`,
    }];
  });
}

const USER_ASSIST_SCRIPT = String.raw`
$results = @()
$roots = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist' -ErrorAction SilentlyContinue
foreach ($root in $roots) {
  $countKey = Join-Path $root.PSPath 'Count'
  if (-not (Test-Path $countKey)) { continue }
  $properties = Get-ItemProperty $countKey -ErrorAction SilentlyContinue
  foreach ($property in $properties.PSObject.Properties) {
    if ($property.Name -like 'PS*' -or -not ($property.Value -is [byte[]])) { continue }
    $bytes = [byte[]]$property.Value
    if ($bytes.Length -lt 68) { continue }
    try {
      $fileTime = [BitConverter]::ToInt64($bytes, 60)
      if ($fileTime -le 0) { continue }
      $results += [pscustomobject]@{
        encodedName = $property.Name
        runCount = [BitConverter]::ToInt32($bytes, 4)
        lastRunAt = [DateTime]::FromFileTimeUtc($fileTime).ToString('o')
      }
    } catch {}
  }
}
@($results) | ConvertTo-Json -Compress -Depth 3
`;
