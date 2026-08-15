import type { RecoveredEventInput } from '../../shared/types.js';
import { normalizeApplication } from '../tracking/app-identity.js';
import { runFixedPowerShellJson } from './powershell.js';

interface PrefetchRow { executable?: string; lastWriteAt?: string }

export async function readPrefetchEvents(): Promise<RecoveredEventInput[]> {
  const rows = await runFixedPowerShellJson<PrefetchRow[]>(PREFETCH_SCRIPT);
  return rows.slice(0, 20_000).flatMap((row) => {
    if (!row.executable || !row.lastWriteAt || !Number.isFinite(Date.parse(row.lastWriteAt))) return [];
    const executable = prefetchExecutable(row.executable);
    const normalized = normalizeApplication({ name: executable.replace(/\.exe$/i, ''), executable });
    return [{
      appName: normalized.canonicalName,
      appId: normalized.canonicalId,
      eventType: 'recently-used' as const,
      occurredAt: new Date(row.lastWriteAt).toISOString(),
      sourceKind: 'windows_prefetch',
      confidence: 'low' as const,
      detail: 'A Windows Prefetch file was updated around this time. This is evidence of a launch, not usage duration.',
    }];
  });
}

export function prefetchExecutable(value: string) {
  const withoutHash = value.replace(/-[A-F0-9]{8}$/i, '');
  return withoutHash.toLowerCase().endsWith('.exe') ? withoutHash : `${withoutHash}.exe`;
}

const PREFETCH_SCRIPT = String.raw`
$folder = Join-Path $env:windir 'Prefetch'
$results = if (Test-Path $folder) {
  Get-ChildItem $folder -Filter '*.pf' -File -ErrorAction Stop | ForEach-Object {
    [pscustomobject]@{ executable = $_.BaseName; lastWriteAt = $_.LastWriteTimeUtc.ToString('o') }
  }
} else { @() }
@($results) | ConvertTo-Json -Compress -Depth 3
`;
